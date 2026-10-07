import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const migrationsDir = join(process.cwd(), "packages", "db", "migrations");
const migrationFiles = (await readdir(migrationsDir))
  .filter((name) => name.endsWith(".sql"))
  .sort();

const sql = postgres(databaseUrl, { max: 1 });

try {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migration (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  for (const filename of migrationFiles) {
    const rows = await sql<{ filename: string }[]>`
      SELECT filename FROM schema_migration WHERE filename = ${filename}
    `;
    if (rows.length > 0) continue;

    const migration = await readFile(join(migrationsDir, filename), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(migration);
      await tx`
        INSERT INTO schema_migration (filename) VALUES (${filename})
      `;
    });

    console.log(`applied migration: ${filename}`);
  }
} finally {
  await sql.end();
}
