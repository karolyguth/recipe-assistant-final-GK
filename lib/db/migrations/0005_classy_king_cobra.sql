CREATE TABLE "feedback" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"message_id" varchar(191) NOT NULL,
	"conversation_id" varchar(191),
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_message_id_unique" UNIQUE("message_id")
);
