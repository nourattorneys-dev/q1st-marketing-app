CREATE TABLE "notification_deliveries" (
	"event_id" text NOT NULL,
	"email" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	CONSTRAINT "notification_deliveries_event_id_email_pk" PRIMARY KEY("event_id","email")
);
