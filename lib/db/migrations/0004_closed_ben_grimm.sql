CREATE TABLE "chat_metrics" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"conversation_id" varchar(191),
	"message_id" varchar(191),
	"model" varchar(100) NOT NULL,
	"question" text NOT NULL,
	"status" varchar(20) NOT NULL,
	"error" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"cached_input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"reasoning_tokens" integer DEFAULT 0 NOT NULL,
	"embedding_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"first_token_ms" integer,
	"total_ms" integer NOT NULL,
	"search_ms" integer DEFAULT 0 NOT NULL,
	"rerank_ms" integer DEFAULT 0 NOT NULL,
	"steps" integer DEFAULT 0 NOT NULL,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "chat_metrics_created_idx" ON "chat_metrics" USING btree ("created_at");