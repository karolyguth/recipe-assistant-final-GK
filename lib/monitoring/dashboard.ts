import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { feedback } from '@/lib/db/schema/feedback';
import { chatMetrics } from '@/lib/db/schema/metrics';

// A dashboard adatai: összesítések, idősorok és listák a chat_metrics táblából

export const RANGES = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30, all: null } as const;
export type RangeKey = keyof typeof RANGES;

export function parseRange(value: string | undefined): RangeKey {
  return value && value in RANGES ? (value as RangeKey) : '7d';
}

export type SeriesPoint = {
  bucket: string;
  requests: number;
  errors: number;
  totalP50: number | null;
  totalP95: number | null;
  cost: number;
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function getDashboardData(range: RangeKey) {
  const hours = RANGES[range];
  const since = hours ? new Date(Date.now() - hours * 3600_000) : null;
  const inRange = since ? gte(chatMetrics.createdAt, since) : undefined;
  // 24 órán belül óránként, egyébként naponta csoportosítunk
  const unit: 'hour' | 'day' = range === '24h' ? 'hour' : 'day';

  const [totals] = await db
    .select({
      requests: sql<number>`count(*)::int`,
      errors: sql<number>`count(*) filter (where ${chatMetrics.status} = 'error')::int`,
      aborted: sql<number>`count(*) filter (where ${chatMetrics.status} = 'aborted')::int`,
      firstTokenP50: sql<number>`percentile_cont(0.5) within group (order by ${chatMetrics.firstTokenMs})`,
      firstTokenP95: sql<number>`percentile_cont(0.95) within group (order by ${chatMetrics.firstTokenMs})`,
      totalP50: sql<number>`percentile_cont(0.5) within group (order by ${chatMetrics.totalMs}) filter (where ${chatMetrics.status} = 'ok')`,
      totalP95: sql<number>`percentile_cont(0.95) within group (order by ${chatMetrics.totalMs}) filter (where ${chatMetrics.status} = 'ok')`,
      searchAvg: sql<number>`avg(${chatMetrics.searchMs}) filter (where ${chatMetrics.status} = 'ok')`,
      rerankAvg: sql<number>`avg(${chatMetrics.rerankMs}) filter (where ${chatMetrics.status} = 'ok')`,
      cost: sql<number>`coalesce(sum(${chatMetrics.costUsd}), 0)`,
      inputTokens: sql<number>`coalesce(sum(${chatMetrics.inputTokens}), 0)::bigint`,
      cachedInputTokens: sql<number>`coalesce(sum(${chatMetrics.cachedInputTokens}), 0)::bigint`,
      outputTokens: sql<number>`coalesce(sum(${chatMetrics.outputTokens}), 0)::bigint`,
      reasoningTokens: sql<number>`coalesce(sum(${chatMetrics.reasoningTokens}), 0)::bigint`,
      embeddingTokens: sql<number>`coalesce(sum(${chatMetrics.embeddingTokens}), 0)::bigint`,
      searchesPerRequest: sql<number>`avg(jsonb_array_length(${chatMetrics.toolCalls}) ) filter (where ${chatMetrics.status} = 'ok')`,
    })
    .from(chatMetrics)
    .where(inRange);

  const bucket = sql<string>`date_trunc(${sql.raw(`'${unit}'`)}, ${chatMetrics.createdAt})`;
  const series = await db
    .select({
      bucket: sql<string>`${bucket}::text`,
      requests: sql<number>`count(*)::int`,
      errors: sql<number>`count(*) filter (where ${chatMetrics.status} <> 'ok')::int`,
      totalP50: sql<number>`percentile_cont(0.5) within group (order by ${chatMetrics.totalMs}) filter (where ${chatMetrics.status} = 'ok')`,
      totalP95: sql<number>`percentile_cont(0.95) within group (order by ${chatMetrics.totalMs}) filter (where ${chatMetrics.status} = 'ok')`,
      cost: sql<number>`coalesce(sum(${chatMetrics.costUsd}), 0)`,
    })
    .from(chatMetrics)
    .where(inRange)
    .groupBy(bucket)
    .orderBy(bucket);

  const slowest = await db
    .select({
      createdAt: chatMetrics.createdAt,
      question: chatMetrics.question,
      model: chatMetrics.model,
      firstTokenMs: chatMetrics.firstTokenMs,
      totalMs: chatMetrics.totalMs,
      searchMs: chatMetrics.searchMs,
      steps: chatMetrics.steps,
      costUsd: chatMetrics.costUsd,
    })
    .from(chatMetrics)
    .where(and(inRange, sql`${chatMetrics.status} = 'ok'`))
    .orderBy(desc(chatMetrics.totalMs))
    .limit(8);

  const problems = await db
    .select({
      createdAt: chatMetrics.createdAt,
      question: chatMetrics.question,
      status: chatMetrics.status,
      error: chatMetrics.error,
      totalMs: chatMetrics.totalMs,
    })
    .from(chatMetrics)
    .where(and(inRange, inArray(chatMetrics.status, ['error', 'aborted'])))
    .orderBy(desc(chatMetrics.createdAt))
    .limit(8);

  return {
    range,
    unit,
    totals: {
      requests: totals.requests,
      errors: totals.errors,
      aborted: totals.aborted,
      firstTokenP50: num(totals.firstTokenP50),
      firstTokenP95: num(totals.firstTokenP95),
      totalP50: num(totals.totalP50),
      totalP95: num(totals.totalP95),
      searchAvg: num(totals.searchAvg),
      rerankAvg: num(totals.rerankAvg),
      cost: Number(totals.cost),
      inputTokens: Number(totals.inputTokens),
      cachedInputTokens: Number(totals.cachedInputTokens),
      outputTokens: Number(totals.outputTokens),
      reasoningTokens: Number(totals.reasoningTokens),
      embeddingTokens: Number(totals.embeddingTokens),
      searchesPerRequest: num(totals.searchesPerRequest),
    },
    series: fillBuckets(
      series.map(s => ({
        // Az adatbázis UTC-ben tárol, a csoportosítás is UTC szerint történik
        bucket: new Date(`${s.bucket.replace(' ', 'T')}Z`).toISOString(),
        requests: s.requests,
        errors: s.errors,
        totalP50: num(s.totalP50),
        totalP95: num(s.totalP95),
        cost: Number(s.cost),
      })),
      unit,
      since,
    ),
    slowest: slowest.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })),
    problems: problems.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })),
    feedback: await getFeedbackSummary(since),
  };
}

// Felhasználói visszajelzések: arány, és a legutóbbi negatívak a kérdéssel és a mérésekkel együtt
async function getFeedbackSummary(since: Date | null) {
  const inRange = since ? gte(feedback.updatedAt, since) : undefined;
  const [counts] = await db
    .select({
      positive: sql<number>`count(*) filter (where ${feedback.rating} = 1)::int`,
      negative: sql<number>`count(*) filter (where ${feedback.rating} = -1)::int`,
    })
    .from(feedback)
    .where(inRange);
  const negatives = await db
    .select({
      updatedAt: feedback.updatedAt,
      comment: feedback.comment,
      question: chatMetrics.question,
      totalMs: chatMetrics.totalMs,
    })
    .from(feedback)
    .leftJoin(chatMetrics, eq(chatMetrics.messageId, feedback.messageId))
    .where(and(inRange, eq(feedback.rating, -1)))
    .orderBy(desc(feedback.updatedAt))
    .limit(8);
  return {
    positive: counts.positive,
    negative: counts.negative,
    negatives: negatives.map(n => ({ ...n, updatedAt: n.updatedAt.toISOString() })),
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

// Az üres órák/napok is megjelennek nullával, így az idősor egyenletes
function fillBuckets(points: SeriesPoint[], unit: 'hour' | 'day', since: Date | null): SeriesPoint[] {
  const step = unit === 'hour' ? 3600_000 : 86_400_000;
  const floor = (d: Date) => {
    const t = new Date(d);
    if (unit === 'hour') t.setUTCMinutes(0, 0, 0);
    else t.setUTCHours(0, 0, 0, 0);
    return t.getTime();
  };
  const start = since ? floor(since) : points.length ? floor(new Date(points[0].bucket)) : floor(new Date());
  const end = floor(new Date());
  const byTime = new Map(points.map(p => [floor(new Date(p.bucket)), p]));
  const out: SeriesPoint[] = [];
  for (let t = start; t <= end; t += step) {
    out.push(byTime.get(t) ?? { bucket: new Date(t).toISOString(), requests: 0, errors: 0, totalP50: null, totalP95: null, cost: 0 });
  }
  return out;
}
