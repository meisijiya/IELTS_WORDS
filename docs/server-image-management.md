# Server Image Management Handbook

> SSH-based manual management of docker images on the `<host>` production server.
> Covers normal prune, emergency cleanup, database protection, and when to use
> GitHub Actions workflows instead.

## 1. Connect

```bash
ssh <admin-user>@<host>
```

## 2. Inspect state

```bash
# Containers: yasi-app + yasi-postgres should both be Up + healthy
docker ps --filter "name=yasi"

# All yasi-words images on this host (latest + rollback history)
docker images --format "{{.ID}} {{.Size}} {{.CreatedSince}} {{.Repository}}:{{.Tag}}" | grep yasi-words

# Disk + docker layer usage
df -h /
docker system df
```

Healthy state:

- `yasi-app` Up + (healthy) — running the latest image
- `yasi-postgres` Up + (healthy) — database container
- `df -h /` Use% < 80%

## 3. Standard prune (keep current + 1 rollback)

`deploy.yml` already runs this on every deploy, but if the server has > 3 yasi-words
images (e.g. after a few manual interventions), run it manually:

```bash
cd /opt/yasi-words

CURRENT_ID=$(docker ps --filter "name=yasi-app" --format "{{.Image}}" | head -1)
echo "current: $CURRENT_ID"

# Sort all yasi-words by created time DESC, skip the running one,
# delete everything beyond the next-newest (keeps current + 1 rollback = 2 total).
docker images --format "{{.ID}}|{{.CreatedAt}}|{{.Repository}}:{{.Tag}}" \
  | grep "yasi-words" \
  | sort -t'|' -k2 -r \
  | awk -F'|' -v keep_id="$CURRENT_ID" '{
      if ($1 == keep_id) next
      if (++seen > 1) print $1
    }' \
  | xargs -r docker rmi -f

# Free up dangling layers + build cache older than 24h
docker image prune -f --filter "until=24h"
docker builder prune -f --filter "until=24h"

# Verify
df -h /
```

## 4. Emergency cleanup (disk full / `No space left on device`)

Use when the standard prune isn't enough or `git pull` itself fails with ENOSPC:

```bash
# Aggressive: delete ALL images not referenced by a running container.
# Safe because yasi-app + yasi-postgres currently hold references to the
# image they were started from.
docker image prune -a -f
docker builder prune -af

# Verify
df -h /
docker system df
```

If still tight, the GitHub Actions `Free-Disk` workflow does the same thing and
prints before/after `df -h` for the record.

## 5. Database protection — commands that MUST NOT be run

The named volume `yasi-words_pgdata` holds every `User` / `Attempt` / `Session` /
`Checkin` / `UserWord` row. Losing it = losing every user's learning history.

```bash
# NEVER — these delete or risk deleting the pgdata volume
docker compose down -v              # wipes ALL named volumes
docker compose down postgres         # removes the postgres service container
docker compose up -d --force-recreate postgres   # same risk
docker volume rm yasi-words_pgdata   # direct wipe
```

Safe to recreate ONLY the app container. Postgres + pgdata are untouched:

```bash
docker compose up -d --force-recreate app
```

Defensive checks (confirm postgres is healthy after any manual ops):

```bash
docker ps --filter "name=yasi-postgres" --filter "status=running"
docker exec yasi-postgres pg_isready -U yasi -d yasi_db
```

Note: the deploy.yml pre-check uses the **full** volume name `yasi-words_pgdata`
(compose prefixes the alias `pgdata` with the project name). If a future script
references just `pgdata`, that's a bug — the actual name is `<project>_pgdata`.

## 6. Troubleshooting

### Container in restart loop

```bash
docker logs --tail 80 yasi-app
docker logs --tail 80 yasi-postgres
```

### `docker pull` fails (auth error)

```bash
# Re-login to ACR personal edition
docker login -u <aliyun-account-id> crpi-<your-registry>.cn-shenzhen.personal.cr.aliyuncs.com
# Test
docker pull crpi-<your-registry>.cn-shenzhen.personal.cr.aliyuncs.com/meisijiya/yasi-words:latest
```

If credentials are stale, rotate via Alibaba Cloud console → ACR → Access
Credentials → Reset Password, then update the `ALIYUN_REGISTRY_PASSWORD` secret
in GitHub repo settings (so the next `deploy.yml` run picks it up).

### Audio files missing in app

The `public/audio/` directory is backed by the named volume `yasi-words_audio_data`.
Normally baked into the image at build time; if baked layer is corrupt, the
container fetches from `AUDIO_BUNDLE_URL` on startup.

```bash
docker exec yasi-app find /app/public/audio -name "*.mp3" | wc -l   # expect >= 20000
```

If 0 or low, restart the app to retry the runtime fetch:

```bash
docker compose restart app
```

## 7. When to use GitHub Actions workflows instead

Most ops scenarios have a dedicated `workflow_dispatch` workflow — prefer those
over SSH when possible (better audit trail, no manual typos):

| Scenario | Workflow |
|---|---|
| Daily automatic backup | `Backup-Database` (cron 03:00 Asia/Shanghai) |
| Manual backup before risky ops | `Backup-Database` workflow_dispatch |
| Disk cleanup (recorded) | `Free-Disk` workflow_dispatch |
| Run any shell command | `Diagnose` workflow_dispatch (cmd input) |
| Survey user / attempt distribution | `Inspect-Prod-Data` workflow_dispatch |
| Read admin password (redacted) | `Read-Admin-Password` workflow_dispatch |
| Reset admin password | `Reset-Admin-Password` workflow_dispatch |
| Restore production DB schema | `Fix-Prod-Schema` workflow_dispatch |

SSH is mainly for:

- Manual image cleanup during the v1 transition (before A1 ACR remote-lifecycle
  is automated)
- On-the-spot diagnosis when a workflow is too slow

## 8. Sanity check after any ops session

```bash
# Both containers running + healthy
docker ps --filter "name=yasi" --format "{{.Names}} {{.Status}}"

# Database is reachable
docker exec yasi-postgres pg_isready -U yasi -d yasi_db

# Disk has headroom
df -h / | tail -1

# App responds to HTTP
curl -fsS http://127.0.0.1:3000/login >/dev/null && echo "app OK"
```

If any of these fail, do NOT leave the server in that state — investigate before
disconnecting.