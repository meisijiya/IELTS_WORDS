// Schema pre-migration: add userId columns to existing tables with default 0.
// Prisma's `db push` refuses to add NOT NULL columns without defaults to
// populated tables, so we add the columns ourselves first. The data
// migration in migrate-data.ts then backfills userId=0 rows to admin.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface AddSpec {
  table: string;
  column: string;
}

const additions: AddSpec[] = [
  { table: "Session", column: "userId" },
  { table: "Attempt", column: "userId" },
  { table: "Checkin", column: "userId" },
  { table: "UserSettings", column: "userId" },
];

async function hasColumn(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `PRAGMA table_info(${table})`,
  );
  return rows.some((c) => c.name === column);
}

async function main() {
  for (const { table, column } of additions) {
    if (await hasColumn(table, column)) {
      console.log(`[pre-migrate] ${table}.${column} already exists, skipping`);
      continue;
    }
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${table} ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`,
    );
    console.log(`[pre-migrate] added ${table}.${column}`);
  }
  console.log("[pre-migrate] done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
