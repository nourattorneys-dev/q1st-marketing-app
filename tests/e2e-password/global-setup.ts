import { connectPostgres } from "../../src/lib/db/postgres";
import { freshTestDatabase } from "../unit/postgres-test-db";
import { E2E_PASSWORD_DB } from "./constants";

/** A fresh database with the dashboard's tables, before any test. The server is up already but hasn't touched it. */
export default async function globalSetup(): Promise<void> {
  const connection = connectPostgres(await freshTestDatabase(E2E_PASSWORD_DB));
  try {
    await connection.ready();
  } finally {
    await connection.close();
  }
}
