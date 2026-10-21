import { defineConfig } from "drizzle-kit";

// pnpm db:generate writes a migration from the schema; pnpm db:migrate applies them to DATABASE_URL (Neon).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
