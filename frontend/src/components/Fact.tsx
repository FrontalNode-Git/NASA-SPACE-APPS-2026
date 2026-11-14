import { useMemo } from 'react';
import { useApp, useT } from '../lib/store';
import type { Fact as FactT, LinkKind } from '../lib/types';

export function useFacts(): Map<string, FactT> {
  const facts = useApp((s) => s.bundle?.facts);
  return useMemo(() => new Map((facts ?? []).map((f) => [f.id, f])), [facts]);
}

export function useFactsFor(kind: LinkKind, id: string): FactT[] {
  const facts = useApp((s) => s.bundle?.facts);
  return useMemo(() => (facts ?? []).filter((f) => f.links[kind].includes(id)), [facts, kind, id]);
}

/** Placeholder shown wherever the app is still waiting for approved content. */
export function Pending({ id, reason }: { id?: string; reason?: string }) {
  const t = useT();
  return (
    <div
      className="rounded-lg border border-dashed border-line bg-bg/40 px-3 py-2 text-sm text-muted"
      data-testid="pending"
      data-pending-id={id}
    >
      <span className="font-semibold text-ink">{t('pending.title')}</span>
      <span> · {reason ?? t('pending.reason')}</span>
    </div>
  );
}

/**
 * The only way approved content reaches the screen: by fact id. If the id is not in the
 * content files yet, a Pending placeholder renders instead.
 *
 * This is a crew tool, so the statement is shown without its citation. Where each one
 * comes from is recorded in docs/SOURCES.txt.
 */
export function Fact({ id, className = '' }: { id: string; className?: string }) {
  const fact = useFacts().get(id);
  if (!fact) return <Pending id={id} />;
  return (
    <p className={`text-sm leading-relaxed ${className}`} data-fact-id={id}>
      {fact.text}
    </p>
  );
}

export function FactList({ ids }: { ids: string[] }) {
  return (
    <div className="space-y-3">
      {ids.map((id) => (
        <Fact key={id} id={id} />
      ))}
    </div>
  );
}
