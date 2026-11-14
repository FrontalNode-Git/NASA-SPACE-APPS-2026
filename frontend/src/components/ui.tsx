import type { ReactNode } from 'react';
import { useT } from '../lib/store';

export function Panel({
  title,
  action,
  children,
  className = '',
  dim = false,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  dim?: boolean;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-panel p-4 transition-opacity duration-300 ${dim ? 'opacity-25' : ''} ${className}`}
      data-dim={dim || undefined}
    >
      {(title || action) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          {title && <h2 className="font-display text-base font-semibold">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, lead, children }: { title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-5">
      <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
      {lead && <p className="mt-1 max-w-3xl text-muted">{lead}</p>}
      {children}
    </header>
  );
}

export function Tag({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'accent' }) {
  const color = tone === 'accent' ? 'border-accent/60 text-accent' : 'border-line text-muted';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}>{children}</span>
  );
}

/** Marks any view of the fictional crew's readings. */
export function SimulatedTag() {
  const t = useT();
  return <Tag tone="accent">{t('tag.simulated')}</Tag>;
}

export function ProvisionalTag() {
  const t = useT();
  return <Tag>{t('tag.provisional')}</Tag>;
}

export function LockIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.2 7V5a2.8 2.8 0 0 1 5.6 0v2" />
    </svg>
  );
}

export function Button({
  children,
  onClick,
  primary = false,
  disabled = false,
  className = '',
  ...rest
}: {
  children: ReactNode;
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
  className?: string;
} & Record<`data-${string}` | `aria-${string}`, string | boolean | undefined>) {
  const tone = primary
    ? 'bg-accent text-bg border-accent hover:brightness-110'
    : 'bg-panel text-ink border-line hover:border-accent';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-[44px] rounded-lg border px-4 text-sm font-semibold transition disabled:opacity-40 ${tone} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
