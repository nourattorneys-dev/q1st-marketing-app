import { defineConfig } from "drizzle-kit";

// pnpm db:generate writes a migration from the schema. The app applies pending ones itself on first use
// (src/lib/db/postgres.ts); pnpm db:migrate does the same for the Postgres at DATABASE_URL.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
