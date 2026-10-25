import { defineConfig } from "drizzle-kit";

// pnpm db:generate writes a migration from the schema. The app applies pending ones itself on first use
// (src/lib/db/mysql.ts); pnpm db:migrate does the same for a local MySQL at DATABASE_URL.
// The baseline (drizzle/0000_*.sql) was edited after generating: every table gets utf8mb4 options (a host may default
// to latin1), and CREATE TABLE IF NOT EXISTS, so a first preparation cut off midway finishes on the next attempt
// (MySQL commits each CREATE TABLE). A new migration needs the same care for any table it creates.
export default defineConfig({
  dialect: "mysql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
