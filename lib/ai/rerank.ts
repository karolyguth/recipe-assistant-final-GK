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
// A recept eleje (összefoglaló sor, hozzávalók) a döntéshez elég.
const RERANK_DTYPE = "q8";
export const RERANK_MAX_TOKENS = 256;
env.cacheDir = process.env.MODEL_CACHE_DIR ?? ".cache/models";

let loading: Promise<{ tokenizer: PreTrainedTokenizer; model: PreTrainedModel }> | null = null;

function load() {
  loading ??= Promise.all([
    AutoTokenizer.from_pretrained(RERANK_MODEL),
    AutoModelForSequenceClassification.from_pretrained(RERANK_MODEL, { dtype: RERANK_DTYPE }),
  ]).then(([tokenizer, model]) => ({ tokenizer, model }));
  return loading;
}

// Relevancia pontszám 0 és 1 között (a logit szigmoidja) minden dokumentumra, a bemenet sorrendjében
export async function rerankScores(query: string, documents: string[]): Promise<number[]> {
  if (documents.length === 0) return [];
  const { tokenizer, model } = await load();
  const inputs = tokenizer(new Array(documents.length).fill(query), {
    text_pair: documents,
    padding: true,
    truncation: true,
    max_length: RERANK_MAX_TOKENS,
  });
  const { logits } = await model(inputs);
  return (logits.tolist() as number[][]).map(([logit]) => 1 / (1 + Math.exp(-logit)));
}
