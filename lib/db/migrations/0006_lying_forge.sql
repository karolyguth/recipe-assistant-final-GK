-- Áttérés a text-embedding-3-large modellre (3072 dimenzió): a régi vektorok nem alakíthatók át,
-- ezért törlődnek, a dokumentumok pedig újrafeldolgozásra várnak (pnpm db:reprocess)
DELETE FROM "embeddings";--> statement-breakpoint
UPDATE "resources" SET "status" = 'uploaded', "error" = NULL;--> statement-breakpoint
ALTER TABLE "embeddings" ALTER COLUMN "embedding" SET DATA TYPE vector(3072);--> statement-breakpoint
ALTER TABLE "chat_metrics" ADD COLUMN "rerank_tokens" integer DEFAULT 0 NOT NULL;
