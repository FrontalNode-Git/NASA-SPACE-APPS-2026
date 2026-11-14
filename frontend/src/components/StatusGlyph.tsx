import { useT } from '../lib/store';
import type { Status } from '../lib/types';

/** Status is never colour alone: circle = Nominal, triangle = Watch, square = Call ground, plus text. */
export const STATUS_META: Record<Status, { key: string; shape: 'circle' | 'triangle' | 'square'; text: string; bg: string; ring: string }> = {
  nominal: { key: 'status.nominal', shape: 'circle', text: 'text-nominal', bg: 'bg-nominal/10', ring: 'border-nominal/50' },
  watch: { key: 'status.watch', shape: 'triangle', text: 'text-watch', bg: 'bg-watch/10', ring: 'border-watch/60' },
  call_ground: { key: 'status.call_ground', shape: 'square', text: 'text-call', bg: 'bg-call/10', ring: 'border-call/60' },
};

export function StatusGlyph({ status, size = 16, title }: { status: Status; size?: number; title?: string }) {
  const meta = STATUS_META[status];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={`${meta.text} shrink-0`}
      data-shape={meta.shape}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {meta.shape === 'circle' && <circle cx="8" cy="8" r="6.5" fill="currentColor" />}
      {meta.shape === 'triangle' && <path d="M8 1.2 15.4 14.4H0.6Z" fill="currentColor" />}
      {meta.shape === 'square' && <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" fill="currentColor" />}
    </svg>
  );
}

export function StatusBadge({ status, size = 'md' }: { status: Status; size?: 'sm' | 'md' | 'lg' }) {
  const t = useT();
  const meta = STATUS_META[status];
  const pad = size === 'lg' ? 'px-3 py-1.5 text-base' : size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${meta.text} ${meta.bg} ${meta.ring} ${pad}`}
      data-status={status}
    >
      <StatusGlyph status={status} size={size === 'lg' ? 16 : 12} />
      {t(meta.key)}
    </span>
  );
}
