import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

interface SeedWord {
  spelling: string;
  pos: string | null;
  glosses: { pos: string; meaning: string }[];
  flags?: string[];
}

const WORDBOOKS = [
  {
    slug: "concise",
    name: "雅思词汇真经（精简版）",
    description: "高频核心 3611 词 · 入门首选",
    seedFile: "yasi_concise.json",
  },
  {
    slug: "full",
    name: "IELTS（完整版）",
    description: "完整 7076 词 · 进阶全覆盖",
    seedFile: "ielts_full.json",
  },
  {
    slug: "cet6",
    name: "大学英语六级词汇",
    description: "CET-6 5518 词 · 含真人发音",
    seedFile: "cet6.json",
  },
];

async function ensureAdmin() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.warn("[seed] ADMIN_PASSWORD not set, skipping admin bootstrap");
    return;
  }
  const byRole = await prisma.user.findFirst({ where: { role: "admin" } });
  if (byRole) {
    if (byRole.username !== username) {
      console.warn(`[seed] admin user '${byRole.username}' (id=${byRole.id}) already exists; ADMIN_USERNAME='${username}' ignored — rename via /settings instead`);
    } else {
      console.log(`[seed] admin '${username}' already exists (id=${byRole.id})`);
    }
    if (!byRole.passwordHash) {
      console.warn(`[seed] admin '${byRole.username}' has empty passwordHash — re-hashing from ADMIN_PASSWORD`);
      const passwordHash = await hashPassword(password);
      await prisma.user.update({
        where: { id: byRole.id },
        data: { passwordHash },
      });
    }
    await prisma.userSettings.upsert({
      where: { userId: byRole.id },
      create: { userId: byRole.id },
      update: {},
    });
    return;
  }
  const existingByName = await prisma.user.findUnique({ where: { username } });
  if (existingByName) {
    await prisma.user.update({
      where: { id: existingByName.id },
      data: { role: "admin" },
    });
    await prisma.userSettings.upsert({
      where: { userId: existingByName.id },
      create: { userId: existingByName.id },
      update: {},
    });
    console.log(`[seed] reused existing user '${username}' (id=${existingByName.id}) as admin`);
    return;
  }
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      role: "admin",
    },
  });
  // Make sure the admin has a UserSettings row so /api/settings doesn't
  // 404 on first call.
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
  });
  console.log(`[seed] bootstrapped admin '${username}' (id=${user.id})`);
}

async function main() {
  await ensureAdmin();

  const seedDir = join(process.cwd(), "seed");

  for (const wb of WORDBOOKS) {
    console.log(`Seeding ${wb.slug}...`);
    const path = join(seedDir, wb.seedFile);
    const words: SeedWord[] = JSON.parse(readFileSync(path, "utf-8"));

    await prisma.wordbook.upsert({
      where: { slug: wb.slug },
      update: { name: wb.name, description: wb.description },
      create: {
        slug: wb.slug,
        name: wb.name,
        description: wb.description,
      },
    });
    const wbRow = await prisma.wordbook.findUnique({ where: { slug: wb.slug } });
    if (!wbRow) throw new Error(`failed to upsert wordbook ${wb.slug}`);

    const BATCH = 500;
    for (let i = 0; i < words.length; i += BATCH) {
      const batch = words.slice(i, i + BATCH);
      await prisma.$transaction(
        batch.map((w) =>
          prisma.word.upsert({
            where: {
              wordbookId_spelling: { wordbookId: wbRow.id, spelling: w.spelling },
            },
            update: {
              pos: w.pos,
              glosses: JSON.stringify(w.glosses),
              flags: w.flags ? JSON.stringify(w.flags) : null,
            },
            create: {
              wordbookId: wbRow.id,
              spelling: w.spelling,
              pos: w.pos,
              glosses: JSON.stringify(w.glosses),
              flags: w.flags ? JSON.stringify(w.flags) : null,
            },
          })
        )
      );
      console.log(`  ${wb.slug}: ${Math.min(i + BATCH, words.length)}/${words.length}`);
    }
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
