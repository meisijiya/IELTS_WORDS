# Yasi Words · 雅思单词拼写训练器

[![CI Status](https://img.shields.io/github/actions/workflow/status/meisijiya/IELTS_WORDS/ci.yml?branch=main&style=flat-square&logo=github&label=CI)](https://github.com/meisijiya/IELTS_WORDS/actions/workflows/ci.yml)
[![Docker Image](https://img.shields.io/badge/docker-阿里云镜像-blue?style=flat-square&logo=docker)](https://github.com/meisijiya/IELTS_WORDS/pkgs/container/ielts_words)
[![License: MIT](https://img.shields.io/github/license/meisijiya/IELTS_WORDS-green?style=flat-square)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org)

> 📦 **部署到生产环境？** 看 [CICD.md](CICD.md) — 完整的 GitHub Actions + 阿里云容器镜像服务 (ACR) + 云服务器配置指南，从首次配置到踩过的 12 个坑。

> 为雅思机考的键盘操作习惯设计的本地优先单词训练工具。

## ✨ 特性

### 训练核心
- **Flash-then-Spell 模式** — 显示中英文 → 英文渐变消失 → 键盘拼写，贴合真实机考节奏
- **无限副本模式** — 用户主导无限学习，不需要"每日单词量"，用户手动结束会话。Word 进入学习队列后会在后续 5 倍次出现以巩固。
- **自适应渐进提示** — 新词 2 字母 / 复习词 1 字母 / 已熟练不提示
- **SM-2 简化算法** — 答对 +1，答错 −1，连对 5 次升 level=5（已熟练）。已熟练答错 → 重置为 level=0 重学。
- **错题 FIFO 重出** — 错的词反复出现直到答对
- **实时统计** — 正确 / 错误 / 剩余 / 已练 / 连击中

### 音频系统
- **真人发音（双口音）** — 雅思词频真人发音，US + UK 双口音。闪现阶段 + 反馈时各播一次（合计每词 2 次），强化听感。
- **点击单词重播** — 答题停留时点击单词文字可随时重播该次发音（鼠标 hover 显示音量图标提示）
- **accent 自动 fallback** — 用户选择 US 时，若该词只有 UK 音频，自动用 UK 顶上。零 404。
- **发音 4 态** — 都开（闪+反馈）/ 仅闪现 / 仅反馈 / 静音
- **浏览器缓存** — Next.js 静态资源 1 年 immutable（`/audio/*`）；同一 URL 浏览器永久缓存命中，零重复请求
- **Docker audio bake-in** — 镜像构建时通过 `AUDIO_BUNDLE_URL` 把 238 MB / 20194 个 mp3 烤入 image，构建一次即永久生效
- **Runtime fetch fallback** — 若 baked layer 缺失或损坏，`entrypoint.sh` 会在容器启动时 runtime 拉同 bundle 到 `audio_data` named volume（不需 reload image）

### 错题系统
- **错题 Session** — 独立练习入口，答对/答错**都不改** word 的持久化 state（attempts / level / masteredAt 不变），仅插入 Attempt 行作为"出现"记录
- **错词榜** — 按错误次数排序，可按时间筛选（今天 / 近一周 / 近一月 / 全部）；展开页有 Top-N（5/10/20/全部）切换
- **今日已复习** — 仅 mode='review' 的 Attempt 行触发 badge；drill 模式的错词 attempt **不**算复习。错词行带 ✓ 今日已复习 绿徽
- **错词详情复习历史曲线** — 30 天每日正确率折线图（120×32 inline SVG + hover tooltip），展开错词行时显示
- **两个批量入口** — 全量复习（包括今日已复习）/ 仅剩余（跳过今日已复习的）
- **单词行可展开** — 显示释义 + 复习曲线 + 单练按钮 + "标记已熟"按钮
- **已掌握自动消失** — 已熟练（level=5）的单词不会出现在错词榜
- **三个集合页** — `/wrong-words/<book>` / `/learning/<book>` / `/mastered/<book>`，顶部 tabs 互链；按 3 路互斥分区自动归类

### 拉取机制
- **加权拉取** — 一批 20 词按比例分配：
  - **review 优先（默认）**: 4 新 + 8 学过 + 8 已熟练
  - **balanced**: 14 新 + 5 学过 + 1 已熟练
  - **new 优先**: 18 新 + 2 学过 + 0 已熟练
- **session 可并行** — 同 wordbook 下允许 random + targeted 多会话共存；同一 IDs 集合（包括乱序）自动复用
- **页式补仓** — `refillQueue` 在队列 < 5 时静默 fetch 下一页，单 batch < 100 KB

### 视听反馈
- **音效反馈** — 答对：`Web Audio API` 双音 ding；答错：双音 buzz（0 资源，浏览器合成）
- **Streak 连击音效** — 3 / 6 / 9 / 12 / 15 milestones 升级：双音 → bell 上行 → sparkle 瀑布 → swell + 合弦
- **Streak 屏幕震动** — 微妙 1-4 px 位移，≤ 120 ms，不干扰学习
- **banner pulse** — milestone 触发 streak banner 刷新动画（force reflow + key restart）

### 词库
- **雅思词汇真经（精简版）** — 3,611 高频核心词 · 入门首选
- **IELTS（完整版）** — 7,076 词 · 进阶全覆盖
- **大学英语六级词汇** — 5,518 词 · CET-6，含真人发音
- 新增词库流程见 [`docs/add-wordbook.md`](docs/add-wordbook.md)

### 数据持久化
- **打卡记录跨重置保留** — `/checkin/[date]` 是当日 attempt 实时聚合。重置会清空 attempts → 历史消失？
  不会：`Checkin` 表在首次访问时 lazy 快照，重置前 eager 快照所有有 attempt 的日期。
  即使用户清空所有尝试，`/checkin` 仍能显示历史。

### 数据审计
- `audit/word-audit.py` — schema 完整性 + 跨书一致性 + POS 分布
- `audit/audio-audit.py` — 文件存在 + magic bytes (MPEG/WAV) + 大小分布
- `audit/spot-check.py` — 释义抽样 vs Youdao 字典（heuristic）
- 详细报告在 `audit/*-report.md`，可重复跑

### 安全与运维
- **重置防呆** — `/api/admin/reset` 强制要求确认短语（`RESET PROGRESS` / `DELETE ATTEMPTS` / `DELETE SESSIONS` / `RESET EVERYTHING`），避免误触
- **HMAC Cookie 认证** — Edge Runtime safe
- **CI/CD** — GitHub Actions 自动 lint / typecheck / build + 阿里云容器镜像推 + SSH 部署

## 🖼️ 预览

```
┌─ 主页 ──────────────────────────┐  ┌─ 练习界面（无限副本）──────────────────┐
│ Yasi Words                       │  │                                       │
│ [日历] 打卡  [图表] 分析  [齿轮] 设置       │  │          v. 监督                      │
│                                 │  │                                       │
│ ┌──────────────────────────┐  │  │   a t t _ t _ t _ _ _                  │
│ │雅思词汇真经（精简版）常规│  │  │                                       │
│ │开始 14:23  已练 12 (9✓)  │  │  │   ┌──────────────────────────┐      │
│ │[继续]  [结束]              │  │  │   │ attitide_               │      │
│ └──────────────────────────┘  │  │   └──────────────────────────┘      │
│                                 │  │   adj. 监督; 监理                    │
│ ┌──────────┐  ┌──────────┐     │  │   [L1/5 · 已答对1 · 总尝试1] [火焰] 1连击中│
│ │ 精简  3.6K│  │ 完整  7.0K│    │  │                                       │
│ └──────────┘  └──────────┘     │  │   [音量] 点击单词重播                        │
│                                 │  │                                       │
│ 雅思词汇真经 (active session)  │  │   ╭─────── 答完停留 ──────╮           │
│ ┌──────────────────────────┐  │  │   │ ✓ 拼对了 attitide   │           │
│ │昨天 19:00 已练 30 (25✓)  │  │  │   │  [下一题]            │           │
│ │[继续]  [结束]              │  │  │   ╰─────────────────────╯           │
│ └──────────────────────────┘  │  │                                       │
└─────────────────────────────┘  └─────────────────────────────────────┘

┌─ 错题榜（展开页 /wrong-words/[wordbook]）─────────┐
│ 错词榜 · 雅思词汇真经（精简版） · 近一周 [今日][一周][一月][全部]│
│  Top-N [5][10][20][全部]                          │
│                                                  │
│  ┌──────────────────────────────────────────┐  │
│  │ [靶心] 批量复习模式：全量 18 · 已复习 6 · 剩余 12 │  │
│  │ [全量复习 18词]  [仅剩余 12词]            │  │
│  └──────────────────────────────────────────┘  │
│                                                  │
│  1. atmosphere  n.大气层          ✗ 4 ✓ 1  [✓今日已复习]│
│  2. perspective n./v. 看法        ✗ 3 ✓ 0            │
│  3. undertake   v.承担            ✗ 2 ✓ 1            │
│  ...                                              │
│                                                  │
│  展开 → 释义 · [单练] [标记已熟]                │
└──────────────────────────────────────────────────┘
```

## 🚀 快速开始

### 方式 A · Docker（推荐 · 1 分钟）

```bash
git clone https://github.com/meisijiya/IELTS_WORDS.git yasi-words
cd yasi-words
cp .env.docker.example .env
nano .env  # 改 ADMIN_PASSWORD / (可选) AUDIO_BUNDLE_URL 烤入发音
docker compose up -d --build
open http://localhost:3000
```

> **国内访问加速**：镜像源全用阿里云（registry.cn-hangzhou.aliyuncs.com）和淘宝（registry.npmmirror.com），中国大陆服务器无需特殊网络配置。

### 方式 B · 本地开发

```bash
# 前置：Node.js 22+，可选 Python 3.10+（仅 PDF 提取 / 音频下载脚本用）

npm install
npx prisma db push
npx tsx prisma/seed.ts

cp .env.example .env
# 编辑 .env，至少修改 ADMIN_PASSWORD

npm run dev
open http://localhost:3000

# 可选：下载真人发音（一次性 ~30 min，从有道字典）
python3 tools/fetch_pronunciations.py
```

## 🧰 常用命令

```bash
# 开发 / 构建
npm run dev          # 开发模式
npm run build        # 生产构建
npm start            # 生产服务器
npm run typecheck    # TypeScript 类型检查
npm run lint         # ESLint

# 数据 / 测试
npm run test:parser  # PDF parser (pytest, 18 tests)
npm run gate         # 数据准确率验证 (audit gate)

# 音频管理
python3 tools/fetch_pronunciations.py            # 多并发下载 10K 词双口音
python3 tools/check_audio.py                     # DB vs filesystem 核对 (输出缺失列表)
python3 tools/retry_missing_audio.py             # throttled 重试缺失
python3 tools/release-audio.py --tag v1.0.0      # 上传到 GitHub Release

# Docker
docker compose up -d --build
docker compose logs -f app
docker compose down
```

## 📚 文档

- 📦 [腾讯云轻量级部署](docs/deploy-tencent-cloud.md) — 裸机部署 + 阿里云 ACR
- 🐳 [Docker 一键部署](docs/deploy-docker.md) — 国内镜像源优化 + audio bundle 烤入
- 📄 [PDF 提取规则](docs/grammar.md) — 数据准确率 100% 的来由
- 🤖 [GitHub Actions CI/CD](#-cicd) — lint + 类型 + 数据 gate + 部署

## 🏗️ 技术栈

| 层 | 选型 |
|---|---|
| **框架** | Next.js 15 (App Router) + TypeScript 5 + React 19 |
| **ORM** | Prisma 6 + SQLite (dev) / PostgreSQL (prod) |
| **UI** | Tailwind CSS 3 + 自定义"冬天旭日"主题 |
| **认证** | Web Crypto HMAC-signed cookie (Edge-safe) |
| **音频** | Web Audio API（合成 chime / buzz / streak 音效）+ Next.js 静态文件提供 MP3 |
| **图表** | Recharts（分析页）+ html2canvas（打卡图导出） |
| **音频下载** | Youdao OpenDict API，13500 词 ~ 30 分钟，stdlib urllib + threading |
| **测试** | Vitest (TS) + pytest (Python parser) |
| **部署** | Docker Compose + 阿里云容器镜像 ACR + 腾讯云服务器 |

## 📂 项目结构

```
.
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── page.tsx               # 主页（词库选择 + 未完成会话卡）
│   │   ├── login/                 # 登录
│   │   ├── practice/[wordbook]/   # 练习页面 + PracticeClient
│   │   ├── analytics/             # 学习分析仪表盘 + analytics-client
│   │   ├── checkin/[date]/        # 单日打卡页 + html2canvas 导出 PNG
│   │   ├── wrong-words/[wordbook]/# 错题榜展开页 + 今日已复习标
│   │   ├── settings/              # 设置页（含拉取优先级 + 重置防呆）
│   │   └── api/
│   │       ├── sessions/          # POST 创建 / GET active / DELETE 结束
│   │       ├── attempts/          # POST 答对/错；支持 drill / review 模式
│   │       ├── words/             # GET random+weighted list / mark-mastered
│   │       ├── analytics/         # GET 进度 + 错题榜 + 错误位置分析
│   │       ├── settings/          # GET/PUT pronunciationMode + pullPriority + accent
│   │       └── admin/reset/       # POST 清空 + 强制 confirm phrase
│   ├── lib/                       # 工具库 (auth HMAC / db 单例)
│   └── components/                # 共享组件
├── prisma/
│   ├── schema.prisma              # Wordbook / Word / Session / Attempt / UserSettings
│   │                              # Word.masteredAt · Session.mode (drill|review)
│   └── seed.ts                    # 从 seed JSON 导入
├── seed/                          # 10,686 词 JSON（精简 3,611 + 完整 7,075）
├── tools/                         # PDF 提取 + 解析 + 校验 + 音频管理
│   ├── fetch_pronunciations.py    # 多并发下载 US+UK 真人发音
│   ├── check_audio.py             # DB vs filesystem 核对
│   ├── retry_missing_audio.py     # throttled 重试缺失
│   ├── release-audio.py           # 上传到 GitHub Release
│   └── audit.py                   # 生成全量 TSV + 抽样对比
├── release/                       # gitignored 预打包音频 tarball
├── public/audio/                  # gitignored 运行时下载音频
├── docker/
│   └── entrypoint.sh              # 等 DB + migrate + (可选) seed
├── docs/
│   ├── deploy-tencent-cloud.md
│   ├── deploy-docker.md
│   └── grammar.md
├── Dockerfile
├── docker-compose.yml
└── .github/workflows/             # ci.yml + deploy.yml
```

## 🔍 数据来源与准确率

- **词源**：用户提供的《雅思词汇真经》+《IELTS》两本 PDF（共 10,686 词）
- **提取方式**：双引擎交叉验证（PyMuPDF + pdfplumber）+ 人工校对
- **准确率**：抽样 1000/1000 = 100% PASS ✅
- **审核工具**：`tools/audit.py` 生成全量 TSV，`audit/sample_review.html` 抽样对比

## 🚢 部署

详见 [docs/deploy-docker.md](docs/deploy-docker.md) 与 [docs/deploy-tencent-cloud.md](docs/deploy-tencent-cloud.md)。要点：

### 国内云服务器加速镜像（已配置）
| 用途 | 镜像源 | 备注 |
|---|---|---|
| Docker 基础镜像 | `registry.cn-hangzhou.aliyuncs.com/library/` | Aliyun hub 直链 |
| Alpine apk | `mirrors.aliyun.com/alpine/...` | |
| npm | `registry.npmmirror.com` | |
| GitHub | （**未额外加速**）| ghproxy 在腾讯云主机上**超时不可达**；GH Actions runner + 用户浏览器直连 GitHub OK |

### audio bundle 烤进 image

```bash
# 1. 本地打包（一次性 ~20 秒，gzip 压缩 ~50%）
tar czf /tmp/audio_full.tgz -C public audio/

# 2. 在 GitHub Release 页面手动上传（API 单文件上限 100 MB；238 MB bundle 必须 web UI）
#    URL: https://github.com/<owner>/<repo>/releases/new
#    asset name: audio_full.tgz
#    tag: e.g. audio-full-2026-07-23

# 3. workflow file: deploy.yml 把 AUDIO_BUNDLE_URL 指向新 tag
#    AUDIO_BUNDLE_URL=https://github.com/<owner>/<repo>/releases/download/<tag>/audio_full.tgz

# 4. 推 commit → GH Actions build (no BuildKit cache, 5–6 min) → server pull → up
```

镜像构建时一次性下载音频烤入（**BuildKit cache 故意关闭**，否则 stale layer 会复用旧 audio 内容）。

`entrypoint.sh` 还会在容器启动时做一层兜底：若 baked audio 缺失（如 cache 复用 bug 时），runtime 从同 URL 拉到 `audio_data` named volume，`docker compose restart` 即可恢复。

## 🎯 算法概览

### Word Level（SM-2 简化版）

```
初始:     level = 0
答对:     level = min(5, level + 1),  level 首次到 5 → masteredAt = now()
答错:     若 level >= 5 (已熟练) → level = 0, masteredAt = null  (de-master 重学)
         否则: level = max(0, level - 1)
```

### Session Mode

- **drill（默认）**: 答对/答错都更新 Word 的 level / attempts / correct / masteredAt。
- **review（错题 Session）**: 只插入 Attempt 行作为"出现"记录，**不修改 Word 任何字段**。错题榜的"今日已复习"由 Attempt.createdAt 推断。

### 错题 Session 流程

```
[Analytics 错题榜] → "仅剩余" 按钮 (筛掉今日已复习的)
   ↓ GET /practice/concise?ids=10,20,30
   ↓ POST /api/sessions (wordIds=[10,20,30], mode='review')
   ↓ 答完 3 个单词，每次插入 Attempt（不污染 word 状态）
   ↓ 显示 "本轮完成 [彩带]" 页
   ↓
   ✦ 错题榜 word 10, 20, 30 现在带 "今日已复习" badge
   ✦ "仅剩余" 自动排除它们
```

### 拉取加权算法

```
N = 20 (单 batch 上限)
priority = 'review' | 'balanced' | 'new'

PULL_CONFIG[priority] = {
  ratio:    [新, 学过, 已熟练],
  fallback: [出错时优先填哪个池]
}

review:    { ratio: [4, 8, 8], fallback: [mastered, learned, new] }   # 复习密集
balanced:  { ratio: [14, 5, 1], fallback: [new, learned, mastered] }  # 默认
new:       { ratio: [18, 2, 0], fallback: [new, learned, mastered] } # 扩张密集
```

边界情况：
- 所有词都已尝试 → fallback 到 learned 池，仍能拉 20
- 所有词已熟练 → fallback 到 mastered 池，答错触发 de-master 后再次出现
- 全部 masteredAt 过滤完了 → API 返回空数组 `{"words": []}`，前端显示"已掌握所有"

## 🤝 贡献 / 自定义

- 加新词库：编辑 `seed/*.json` + `prisma/seed.ts` 的映射，跑 `npx tsx prisma/seed.ts`
- 调整拉取比例：编辑 `src/app/api/words/route.ts` 的 `PULL_CONFIG`
- 改 streak milestone 倍率：编辑 `src/app/practice/[wordbook]/practice-client.tsx` 的 `playStreakChime` 里 `tier` 判定

## 📜 License

MIT © 2026 Yasi Words contributors

---

<p align="center">
  <sub>Built with ❤️ for IELTS learners fighting the keyboard.</sub>
</p>
