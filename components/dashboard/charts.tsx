'use client';

import { useState } from 'react';

import type { SeriesPoint } from '@/lib/monitoring/dashboard';

// Egyszerű SVG idősor diagramok: vékony jelek, halvány rács, hover tooltip és táblázatos nézet.
// Színek: 1. sorozat kék, 2. sorozat narancs (a palettát színtévesztés-szimulációval ellenőriztem).
const SERIES_1 = '#2a78d6';
const SERIES_2 = '#eb6834';
const GRID = '#e7e6e2';
const TEXT_MUTED = '#6b6a65';

const W = 640;
const H = 200;
const M = { top: 12, right: 12, bottom: 26, left: 52 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;

// Kerek tengelyosztás: legfeljebb ~4 lépés, a lépés 1, 2, 2,5 vagy 5 szorosa egy tízhatványnak
// (darabszámnál csak egész lépés)
function niceScale(max: number, integer = false) {
  const raw = Math.max(max, integer ? 1 : Number.EPSILON) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  let step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
  if (integer) step = Math.max(1, Math.ceil(step));
  if (max <= 0) return { yMax: step * 4, step };
  return { yMax: Math.ceil(max / step) * step, step };
}

export function bucketLabel(iso: string, unit: 'hour' | 'day') {
  const d = new Date(iso);
  return unit === 'hour'
    ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

type Series = { name: string; color: string; value: (p: SeriesPoint) => number | null };

function Frame({
  points,
  unit,
  yMax,
  step,
  format,
  children,
  hover,
  setHover,
  tooltip,
}: {
  points: SeriesPoint[];
  unit: 'hour' | 'day';
  yMax: number;
  step: number;
  format: (v: number) => string;
  children: React.ReactNode;
  hover: number | null;
  setHover: (i: number | null) => void;
  tooltip: (p: SeriesPoint) => React.ReactNode;
}) {
  const band = PW / Math.max(points.length, 1);
  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step);
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" onMouseLeave={() => setHover(null)}>
        {ticks.map(t => {
          const y = M.top + PH - (t / yMax) * PH;
          return (
            <g key={t}>
              <line x1={M.left} x2={W - M.right} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
              <text x={M.left - 8} y={y + 4} textAnchor="end" fontSize={11} fill={TEXT_MUTED}>
                {format(t)}
              </text>
            </g>
          );
        })}
        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text key={p.bucket} x={M.left + band * (i + 0.5)} y={H - 8} textAnchor="middle" fontSize={11} fill={TEXT_MUTED}>
              {bucketLabel(p.bucket, unit)}
            </text>
          ) : null,
        )}
        {children}
        {hover !== null && (
          <line
            x1={M.left + band * (hover + 0.5)}
            x2={M.left + band * (hover + 0.5)}
            y1={M.top}
            y2={M.top + PH}
            stroke={TEXT_MUTED}
            strokeWidth={1}
            opacity={0.4}
          />
        )}
        {/* A hover célterület a teljes sáv, nem csak a jel */}
        {points.map((p, i) => (
          <rect
            key={p.bucket}
            x={M.left + band * i}
            y={M.top}
            width={band}
            height={PH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>
      {hover !== null && points[hover] && (
        <div
          className="pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-md border bg-white px-3 py-2 text-xs shadow-sm"
          style={{
            left: `${((M.left + band * (hover + 0.5)) / W) * 100}%`,
            transform: hover > points.length / 2 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)',
          }}
        >
          <p className="mb-1 font-medium">{bucketLabel(points[hover].bucket, unit)}</p>
          {tooltip(points[hover])}
        </div>
      )}
    </div>
  );
}

function DataTable({ points, unit, columns }: { points: SeriesPoint[]; unit: 'hour' | 'day'; columns: { name: string; cell: (p: SeriesPoint) => string }[] }) {
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-muted-foreground">Show data as a table</summary>
      <table className="mt-2 w-full text-left text-xs">
        <thead>
          <tr className="border-b">
            <th className="py-1 pr-2 font-medium">{unit === 'hour' ? 'Hour' : 'Day'}</th>
            {columns.map(c => (
              <th key={c.name} className="py-1 pr-2 font-medium">
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.filter(p => p.requests > 0).map(p => (
            <tr key={p.bucket} className="border-b last:border-0">
              <td className="py-1 pr-2">{bucketLabel(p.bucket, unit)}</td>
              {columns.map(c => (
                <td key={c.name} className="py-1 pr-2 tabular-nums">
                  {c.cell(p)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const usd = (v: number) => (v === 0 ? '$0' : v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`);
// A szerver komponens csak nevet ad át (függvényt nem adhat át kliens komponensnek)
const BAR_METRICS = {
  requests: {
    name: 'Requests',
    value: (p: SeriesPoint) => p.requests,
    format: (v: number) => compact.format(v),
    axis: (v: number) => compact.format(v),
    integer: true,
  },
  cost: {
    name: 'Cost',
    value: (p: SeriesPoint) => p.cost,
    format: usd,
    axis: (v: number) => `$${Number(v.toPrecision(3))}`,
    integer: false,
  },
};

// Oszlopdiagram egy sorozattal (kérésszám, költség): 4px lekerekített vég, max 24px vastag
export function BarChart({ points, unit, metric }: { points: SeriesPoint[]; unit: 'hour' | 'day'; metric: keyof typeof BAR_METRICS }) {
  const { name, value, format, axis, integer } = BAR_METRICS[metric];
  const [hover, setHover] = useState<number | null>(null);
  const { yMax, step } = niceScale(Math.max(0, ...points.map(value)), integer);
  const band = PW / Math.max(points.length, 1);
  const bw = Math.min(24, Math.max(2, band - 2));
  return (
    <>
      <Frame
        points={points}
        unit={unit}
        yMax={yMax}
        step={step}
        format={axis}
        hover={hover}
        setHover={setHover}
        tooltip={p => (
          <p>
            {name}: <span className="font-medium tabular-nums">{format(value(p))}</span>
          </p>
        )}
      >
        {points.map((p, i) => {
          const h = (value(p) / yMax) * PH;
          if (h <= 0) return null;
          const x = M.left + band * (i + 0.5) - bw / 2;
          const y = M.top + PH - h;
          const r = Math.min(4, h, bw / 2);
          return (
            <path
              key={p.bucket}
              d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${y + h} Z`}
              fill={SERIES_1}
              opacity={hover === null || hover === i ? 1 : 0.55}
            />
          );
        })}
      </Frame>
      <DataTable points={points} unit={unit} columns={[{ name, cell: p => format(value(p)) }]} />
    </>
  );
}

// Vonaldiagram két sorozattal (p50 és p95 válaszidő), jelmagyarázattal
export function LatencyChart({ points, unit }: { points: SeriesPoint[]; unit: 'hour' | 'day' }) {
  const [hover, setHover] = useState<number | null>(null);
  const series: Series[] = [
    { name: 'Median (p50)', color: SERIES_1, value: p => p.totalP50 },
    { name: 'p95', color: SERIES_2, value: p => p.totalP95 },
  ];
  const sec = (ms: number) => `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  // Másodpercben kerekítünk, hogy a tengely 5 s, 10 s... lépésekben menjen
  const scale = niceScale(Math.max(0, ...points.flatMap(p => series.map(s => s.value(p) ?? 0))) / 1000);
  const yMax = scale.yMax * 1000;
  const step = scale.step * 1000;
  const axis = (ms: number) => `${Number((ms / 1000).toPrecision(3))} s`;
  const band = PW / Math.max(points.length, 1);
  const xy = (i: number, v: number) => [M.left + band * (i + 0.5), M.top + PH - (v / yMax) * PH] as const;

  return (
    <>
      <div className="mb-2 flex gap-4 text-xs text-muted-foreground">
        {series.map(s => (
          <span key={s.name} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} /> {s.name}
          </span>
        ))}
      </div>
      <Frame
        points={points}
        unit={unit}
        yMax={yMax}
        step={step}
        format={axis}
        hover={hover}
        setHover={setHover}
        tooltip={p => (
          <>
            {series.map(s => (
              <p key={s.name} className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.name}: <span className="font-medium tabular-nums">{s.value(p) === null ? '–' : sec(s.value(p)!)}</span>
              </p>
            ))}
          </>
        )}
      >
        {series.map(s => {
          // Üres időszaknál megszakad a vonal
          const segments: string[][] = [[]];
          points.forEach((p, i) => {
            const v = s.value(p);
            if (v === null) segments.push([]);
            else segments.at(-1)!.push(xy(i, v).join(','));
          });
          return (
            <g key={s.name}>
              {segments.filter(seg => seg.length > 1).map((seg, k) => (
                <polyline key={k} points={seg.join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              ))}
              {points.map((p, i) => {
                const v = s.value(p);
                if (v === null) return null;
                const [x, y] = xy(i, v);
                return <circle key={p.bucket} cx={x} cy={y} r={4} fill={s.color} stroke="#ffffff" strokeWidth={2} />;
              })}
            </g>
          );
        })}
      </Frame>
      <DataTable
        points={points}
        unit={unit}
        columns={series.map(s => ({ name: s.name, cell: p => (s.value(p) === null ? '–' : sec(s.value(p)!)) }))}
      />
    </>
  );
}
