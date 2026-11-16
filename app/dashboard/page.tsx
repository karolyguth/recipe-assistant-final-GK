import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { BarChart, LatencyChart } from '@/components/dashboard/charts';
import { LocalTime } from '@/components/dashboard/local-time';
import { getDashboardData, parseRange, RANGES, type RangeKey } from '@/lib/monitoring/dashboard';
import { cn } from '@/lib/utils';

// Mindig friss adatok a kérésből
export const dynamic = 'force-dynamic';

const RANGE_LABELS: Record<RangeKey, string> = { '24h': 'Last 24 hours', '7d': 'Last 7 days', '30d': 'Last 30 days', all: 'All time' };

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const sec = (ms: number | null) => (ms === null ? '–' : `${(ms / 1000).toFixed(1)} s`);
const usd = (v: number) => (v === 0 ? '$0' : v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`);

function Tile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-4">
      <h2 className="font-semibold">{title}</h2>
      {subtitle && <p className="mb-3 text-sm text-muted-foreground">{subtitle}</p>}
      {children}
    </section>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: { range?: string } }) {
  const range = parseRange(searchParams.range);
  const data = await getDashboardData(range);
  const t = data.totals;
  const failed = t.errors + t.aborted;
  const perRequest = t.requests ? t.cost / t.requests : 0;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to the assistant
          </Link>
          <h1 className="text-xl font-semibold">Monitoring</h1>
          <p className="text-sm text-muted-foreground">Every chat request: tokens, estimated cost, latency and errors.</p>
        </div>
        <nav className="flex gap-1 rounded-lg border p-1" aria-label="Time range">
          {(Object.keys(RANGES) as RangeKey[]).map(r => (
            <Link
              key={r}
              href={`/dashboard?range=${r}`}
              className={cn('rounded-md px-3 py-1 text-sm', r === range ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-100')}
              aria-current={r === range ? 'page' : undefined}
            >
              {RANGE_LABELS[r]}
            </Link>
          ))}
        </nav>
      </header>

      {t.requests === 0 ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">No chat requests in this time range yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label="Requests"
              value={compact.format(t.requests)}
              detail={`${failed} failed or stopped (${((failed / t.requests) * 100).toFixed(1)}%)`}
            />
            <Tile label="Time to first token" value={sec(t.firstTokenP50)} detail={`median · p95 ${sec(t.firstTokenP95)}`} />
            <Tile label="Total response time" value={sec(t.totalP50)} detail={`median · p95 ${sec(t.totalP95)}`} />
            <Tile label="Estimated cost" value={usd(t.cost)} detail={`${usd(perRequest)} per request`} />
            <Tile
              label="Chat tokens"
              value={compact.format(t.inputTokens + t.outputTokens)}
              detail={`${compact.format(t.inputTokens)} in (${compact.format(t.cachedInputTokens)} cached) · ${compact.format(t.outputTokens)} out (${compact.format(t.reasoningTokens)} reasoning)`}
            />
            <Tile label="Embedding tokens" value={compact.format(t.embeddingTokens)} detail="search queries" />
            <Tile
              label="Retrieval time"
              value={sec(t.searchAvg)}
              detail={`average per request · reranking ${sec(t.rerankAvg)}`}
            />
            <Tile
              label="Tool calls per request"
              value={t.searchesPerRequest === null ? '–' : t.searchesPerRequest.toFixed(1)}
              detail="searches and saved notes"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Requests" subtitle={data.unit === 'hour' ? 'per hour' : 'per day'}>
              <BarChart points={data.series} unit={data.unit} metric="requests" />
            </Card>
            <Card title="Total response time" subtitle="successful requests, median and 95th percentile">
              <LatencyChart points={data.series} unit={data.unit} />
            </Card>
            <Card title="Estimated cost" subtitle={data.unit === 'hour' ? 'per hour, USD' : 'per day, USD'}>
              <BarChart points={data.series} unit={data.unit} metric="cost" />
            </Card>
            <Card title="Failed or stopped requests" subtitle="most recent first">
              {data.problems.length === 0 ? (
                <p className="text-sm text-muted-foreground">None in this time range.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {data.problems.map((p, i) => (
                    <li key={i} className="py-2">
                      <p className="flex items-center gap-2">
                        <span className={cn('rounded px-1.5 py-0.5 text-xs', p.status === 'error' ? 'bg-red-100 text-red-800' : 'bg-zinc-100 text-zinc-700')}>
                          {p.status === 'error' ? 'error' : 'stopped'}
                        </span>
                        <span className="truncate">{p.question}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <LocalTime iso={p.createdAt} /> · after {sec(p.totalMs)}
                        {p.error ? ` · ${p.error}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card title="User feedback" subtitle="👍 / 👎 on the answers, with the question and the user's comment">
            {data.feedback.positive + data.feedback.negative === 0 ? (
              <p className="text-sm text-muted-foreground">No feedback in this time range yet.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-[12rem_1fr]">
                <div>
                  <p className="text-2xl font-semibold tabular-nums">
                    {Math.round((data.feedback.positive / (data.feedback.positive + data.feedback.negative)) * 100)}%
                  </p>
                  <p className="text-sm text-muted-foreground">helpful</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.feedback.positive} 👍 · {data.feedback.negative} 👎
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-sm font-medium">Most recent 👎</p>
                  {data.feedback.negatives.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None – every rated answer was helpful.</p>
                  ) : (
                    <ul className="divide-y text-sm">
                      {data.feedback.negatives.map((n, i) => (
                        <li key={i} className="py-2">
                          <p className="truncate">{n.question ?? '(question not recorded)'}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            <LocalTime iso={n.updatedAt} />
                            {n.totalMs !== null ? ` · answered in ${sec(n.totalMs)}` : ''}
                            {n.comment ? ` · “${n.comment}”` : ' · no comment'}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </Card>

          <Card title="Slowest requests" subtitle="successful requests, slowest first">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Question</th>
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="py-2 pr-3 text-right font-medium">First token</th>
                    <th className="py-2 pr-3 text-right font-medium">Total</th>
                    <th className="py-2 pr-3 text-right font-medium">Retrieval</th>
                    <th className="py-2 pr-3 text-right font-medium">Steps</th>
                    <th className="py-2 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.slowest.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="max-w-xs truncate py-2 pr-3" title={r.question}>
                        {r.question}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground"><LocalTime iso={r.createdAt} /></td>
                      <td className="py-2 pr-3 text-right tabular-nums">{sec(r.firstTokenMs)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{sec(r.totalMs)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{sec(r.searchMs)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.steps}</td>
                      <td className="py-2 text-right tabular-nums">{usd(r.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </main>
  );
}
