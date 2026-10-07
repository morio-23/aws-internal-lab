import assert from "node:assert/strict";
import test from "node:test";

import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

test("identity migration creates user and role tables", async (t) => {
  if (!databaseUrl) {
    t.skip("DATABASE_URL is not configured");
    return;
  }

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const rows = await sql<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('app_user', 'role_assignment', 'schema_migration')
      ORDER BY table_name
    `;

    assert.deepEqual(
      rows.map((row) => row.table_name),
      ["app_user", "role_assignment", "schema_migration"],
    );
  } finally {
    await sql.end();
  }
});
