import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

const SEED_DIR = join(process.cwd(), "seed");

type ExamplesFile = Record<string, Array<{ en: string; zh: string; source?: string }>>;

interface SeedWord {
  spelling: string;
  pos: string | null;
  glosses: { pos: string; meaning: string }[];
  flags?: string[];
}

function loadExamplesFile(slug: string): ExamplesFile {
  const path = join(SEED_DIR, `examples_${slug}.json`);
  if (!existsSync(path)) {
    console.warn(`[seed] ${path} not found — Word.examples will be NULL for all words in ${slug}`);
    return {};
  }
  try {
    const data = JSON.parse(readFileSync(path, "utf-8")) as ExamplesFile;
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      console.warn(`[seed] ${path} has unexpected shape; ignoring`);
      return {};
    }
    return data;
  } catch (e) {
    console.warn(`[seed] failed to parse ${path}: ${e instanceof Error ? e.message : "unknown"}`);
    return {};
  }
}

const FALLBACK_PATH = join(SEED_DIR, "examples-fallback.json");
let fallbackCache: Record<string, ExamplesFile> | null = null;
function loadFallbackFile(slug: string): ExamplesFile {
  if (!fallbackCache) {
    if (!existsSync(FALLBACK_PATH)) return {};
    try {
      fallbackCache = JSON.parse(readFileSync(FALLBACK_PATH, "utf-8"));
    } catch {
      fallbackCache = {};
    }
  }
  return fallbackCache?.[slug] ?? {};
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
  {
    slug: "exam_points",
    name: "雅思阅读考点词 538",
    description: "刘洪波《阅读考点词真经》精选 538 词 · 阅读 7 分+高频",
    seedFile: "exam_points.json",
  },
  {
    slug: "speaking_collocations",
    name: "口语 Part 1 词组（5–8 月）",
    description: "雅思口语 Part 1 高频话题词组 · 32 话题 × 2 词组",
    seedFile: "speaking_collocations.json",
  },
  {
    slug: "writing_collocations",
    name: "雅思写作常见搭配",
    description: "写作高频 collocation · 扫描件 OCR",
    seedFile: "writing_collocations.json",
  },
  {
    slug: "oral_vocabulary",
    name: "剑桥雅思口语写作词汇",
    description: "剑雅口语 + 写作话题词汇 · 扫描件 OCR",
    seedFile: "oral_vocabulary.json",
  },
  {
    slug: "listening_highfreq",
    name: "听力高频词汇",
    description: "雅思听力高频核心词汇 · 扫描件 OCR",
    seedFile: "listening_highfreq.json",
  },
  {
    slug: "academic_core",
    name: "核心学术词汇",
    description: "学术英语核心词汇 · 扫描件 OCR",
    seedFile: "academic_core.json",
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

  for (const wb of WORDBOOKS) {
    console.log(`Seeding ${wb.slug}...`);
    const path = join(SEED_DIR, wb.seedFile);
    // Register the wordbook row even if its seed JSON is missing — the slot
    // appears in the UI so users can retry seed after the JSON lands (e.g.
    // OCR pipeline finished). We only seed words when the file exists.
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

    if (!existsSync(path)) {
      console.warn(`[seed] ${path} not found — Wordbook "${wb.slug}" registered with 0 words`);
      continue;
    }

    const words: SeedWord[] = JSON.parse(readFileSync(path, "utf-8"));

    const examplesBySpelling = loadExamplesFile(wb.slug);
    if (Object.keys(examplesBySpelling).length > 0) {
      console.log(`  loaded ${Object.keys(examplesBySpelling).length} words with examples from examples_${wb.slug}.json`);
    }
    const fallbackBySpelling = loadFallbackFile(wb.slug);
    if (Object.keys(fallbackBySpelling).length > 0) {
      console.log(`  loaded ${Object.keys(fallbackBySpelling).length} words with examples from examples-fallback.json`);
    }

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
              examples: examplesBySpelling[w.spelling] || fallbackBySpelling[w.spelling]
                ? JSON.stringify(examplesBySpelling[w.spelling] || fallbackBySpelling[w.spelling])
                : null,
            },
            create: {
              wordbookId: wbRow.id,
              spelling: w.spelling,
              pos: w.pos,
              glosses: JSON.stringify(w.glosses),
              flags: w.flags ? JSON.stringify(w.flags) : null,
              examples: examplesBySpelling[w.spelling] || fallbackBySpelling[w.spelling]
                ? JSON.stringify(examplesBySpelling[w.spelling] || fallbackBySpelling[w.spelling])
                : null,
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
