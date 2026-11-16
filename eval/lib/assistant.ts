import 'dotenv/config';

// Az asszisztens hívása a chat végpont JSON módjában: ugyanaz a modell, prompt, keresés és mérés, mint a böngészőben
export const ASSISTANT_URL = process.env.ASSISTANT_URL ?? 'http://localhost:3000/api/chat';
export const API_BASE = ASSISTANT_URL.replace(/\/chat$/, '');

export type Turn = { role: 'user' | 'assistant'; content: string };
export type Context = { title: string | null; similarity: number; rerankScore: number | null; content: string };
export type AssistantReply = {
  messageId: string;
  answer: string;
  contexts: Context[];
  toolCalls: { tool: string; input: unknown }[];
  metrics: {
    model: string;
    firstTokenMs: number | null;
    totalMs: number;
    searchMs: number;
    rerankMs: number;
    inputTokens: number;
    outputTokens: number;
    embeddingTokens: number;
  };
};

export async function askAssistant(history: Turn[]): Promise<AssistantReply> {
  const res = await fetch(ASSISTANT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      messages: history.map((m, i) => ({ id: `m${i}`, role: m.role, parts: [{ type: 'text', text: m.content }] })),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Assistant request failed: HTTP ${res.status} ${body.error ?? ''}`);
  return body;
}

// A chatből mentett jegyzetek (pl. „jegyezd meg, hogy vegetáriánus vagyok”): a tesztek előtt és után törlődnek,
// hogy egy eset memóriája ne hasson a következőre
export async function removeChatNotes(): Promise<number> {
  const res = await fetch(`${API_BASE}/documents`);
  if (!res.ok) throw new Error(`Listing documents failed: HTTP ${res.status}`);
  const { documents } = await res.json();
  const notes = documents.filter((d: { source: string }) => d.source === 'chat');
  for (const note of notes) await fetch(`${API_BASE}/documents/${note.id}`, { method: 'DELETE' });
  return notes.length;
}
