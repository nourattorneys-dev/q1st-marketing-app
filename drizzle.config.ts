import { defineConfig } from "drizzle-kit";

// pnpm db:generate writes a migration from the schema. The app applies pending ones itself on first use
// (src/lib/db/mysql.ts); pnpm db:migrate does the same for a local MySQL at DATABASE_URL.
export default defineConfig({
  dialect: "mysql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
