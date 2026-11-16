'use client';

// Időpont a böngésző időzónájában (a szerver, pl. a Docker konténer, UTC-ben futhat)
export function LocalTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {new Date(iso).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
    </time>
  );
}
