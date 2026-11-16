import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
  env,
  type PreTrainedModel,
  type PreTrainedTokenizer,
} from "@huggingface/transformers";

// Cross-encoder: a kérdést és a jelöltet együtt olvassa, ezért pontosabb, mint a vektoros hasonlóság.
// Lokálisan fut (ONNX), az első hívás tölti le a modellt (~90 MB) a .cache/models mappába.
export const RERANK_MODEL = "Xenova/ms-marco-MiniLM-L-6-v2";
env.cacheDir = process.env.MODEL_CACHE_DIR ?? ".cache/models";

let loading: Promise<{ tokenizer: PreTrainedTokenizer; model: PreTrainedModel }> | null = null;

function load() {
  loading ??= Promise.all([
    AutoTokenizer.from_pretrained(RERANK_MODEL),
    AutoModelForSequenceClassification.from_pretrained(RERANK_MODEL, { dtype: "fp32" }),
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
    max_length: 512,
  });
  const { logits } = await model(inputs);
  return (logits.tolist() as number[][]).map(([logit]) => 1 / (1 + Math.exp(-logit)));
}
