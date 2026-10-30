ALTER TABLE "clients" ADD COLUMN "engine_account_id" varchar(191);--> statement-breakpoint
CREATE UNIQUE INDEX "clients_engine_account_id" ON "clients" USING btree ("engine_account_id");