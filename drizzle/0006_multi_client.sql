CREATE TABLE "memberships" (
	"user_id" varchar(191) NOT NULL,
	"client_id" varchar(191) NOT NULL,
	"role" varchar(16),
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "memberships_user_id_client_id_pk" PRIMARY KEY("user_id","client_id")
);
--> statement-breakpoint
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_email";--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "slug" varchar(63);--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "client_id" varchar(191);--> statement-breakpoint
ALTER TABLE "user_sites" ADD COLUMN "client_id" varchar(191);--> statement-breakpoint
CREATE INDEX "memberships_client_id" ON "memberships" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_slug" ON "clients" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_email_client" ON "invitations" USING btree ("email","client_id");--> statement-breakpoint
CREATE INDEX "user_sites_user_client" ON "user_sites" USING btree ("user_id","client_id");--> statement-breakpoint
-- One person, many clients: each person's client and role become their first membership; their site limits and
-- sessions keep that client (a person made before clients existed has none until the app adopts them).
INSERT INTO "memberships" ("user_id", "client_id", "role", "created_at") SELECT "id", "client_id", "role", "created_at" FROM "users" WHERE "client_id" IS NOT NULL;--> statement-breakpoint
UPDATE "user_sites" SET "client_id" = (SELECT "client_id" FROM "users" WHERE "users"."id" = "user_sites"."user_id");--> statement-breakpoint
UPDATE "sessions" SET "client_id" = (SELECT "client_id" FROM "users" WHERE "users"."id" = "sessions"."user_id");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "client_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "role";