import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
  env,
  type PreTrainedModel,
  type PreTrainedTokenizer,
} from "@huggingface/transformers";

// Cross-encoder: a kérdést és a jelöltet együtt olvassa, ezért pontosabb, mint a vektoros hasonlóság.
// Lokálisan fut (ONNX), az első hívás tölti le a modellt a .cache/models mappába.
export const RERANK_MODEL = "Xenova/ms-marco-MiniLM-L-6-v2";
// 8 bites (q8) modell és 256 token jelöltenként: ~4x gyorsabb, mint fp32 / 512 token (20 jelöltnél ~1,2 s -> ~0,3 s).
// A recept eleje (összefoglaló sor, hozzávalók) a döntéshez elég; az evaluáció mindkét beállítást méri.
export type RerankSettings = { dtype: "q8" | "fp32"; maxTokens: number };
export const RERANK_DEFAULT: RerankSettings = { dtype: "q8", maxTokens: 256 };
env.cacheDir = process.env.MODEL_CACHE_DIR ?? ".cache/models";

type Loaded = { tokenizer: PreTrainedTokenizer; model: PreTrainedModel };
const loading = new Map<string, Promise<Loaded>>();

function load(dtype: RerankSettings["dtype"]) {
  if (!loading.has(dtype)) {
    loading.set(
      dtype,
      Promise.all([
        AutoTokenizer.from_pretrained(RERANK_MODEL),
        AutoModelForSequenceClassification.from_pretrained(RERANK_MODEL, { dtype }),
      ]).then(([tokenizer, model]) => ({ tokenizer, model })),
    );
  }
  return loading.get(dtype)!;
}

// Relevancia pontszám 0 és 1 között (a logit szigmoidja) minden dokumentumra, a bemenet sorrendjében
export async function rerankScores(
  query: string,
  documents: string[],
  { dtype, maxTokens }: RerankSettings = RERANK_DEFAULT,
): Promise<number[]> {
  if (documents.length === 0) return [];
  const { tokenizer, model } = await load(dtype);
  const inputs = tokenizer(new Array(documents.length).fill(query), {
    text_pair: documents,
    padding: true,
    truncation: true,
    max_length: maxTokens,
  });
  const { logits } = await model(inputs);
  return (logits.tolist() as number[][]).map(([logit]) => 1 / (1 + Math.exp(-logit)));
}
