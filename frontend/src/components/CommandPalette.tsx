import { useEffect, useMemo, useRef, useState } from 'react';
import { buildPaletteItems, filterPalette } from '../lib/commands';
import { useApp, useT } from '../lib/store';

export function CommandPalette() {
  const t = useT();
  const open = useApp((s) => s.paletteOpen);
  const bundle = useApp((s) => s.bundle);
  const run = useApp((s) => s.run);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const items = useMemo(() => (bundle ? buildPaletteItems(bundle, t) : []), [bundle, t]);
  const results = useMemo(() => filterPalette(items, query), [items, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      input.current?.focus();
    }
  }, [open]);

  if (!open) return null;
  const close = () => useApp.setState({ paletteOpen: false });
  const choose = (index: number) => {
    const item = results[index];
    if (!item) return;
    close();
    run(item.command);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-3 pt-[12vh]" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('palette.title')}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="command-palette"
      >
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              choose(active);
            }
          }}
          placeholder={t('palette.placeholder')}
          aria-label={t('palette.placeholder')}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-results"
          aria-activedescendant={results[active] ? `palette-${active}` : undefined}
          className="w-full border-b border-line bg-transparent px-4 py-4 text-base outline-none placeholder:text-muted"
        />
        <ul id="palette-results" role="listbox" className="max-h-[50vh] overflow-auto p-1.5">
          {results.length === 0 && <li className="px-3 py-4 text-sm text-muted">{t('palette.empty')}</li>}
          {results.map((item, i) => (
            <li
              key={item.id}
              id={`palette-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
              className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-3 text-sm ${
                i === active ? 'bg-accent/15 text-ink' : 'text-ink'
              }`}
            >
              <span className="w-20 shrink-0 text-xs uppercase tracking-wide text-muted">{t(`palette.group.${item.group}`)}</span>
              <span className="flex-1">{item.label}</span>
              {item.hint && <kbd className="rounded border border-line px-1.5 text-xs text-muted">{item.hint}</kbd>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Toasts, and below them a notice that stays while entries are waiting to reach the server. */
export function Toasts() {
  const t = useT();
  const toasts = useApp((s) => s.toasts);
  const pending = useApp((s) => s.pending);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-3" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          data-testid="toast"
          className={`rounded-full border px-4 py-2 text-sm font-semibold shadow-lg ${
            toast.tone === 'error' ? 'border-call/60 bg-panel text-call' : 'border-nominal/60 bg-panel text-nominal'
          }`}
        >
          {toast.text}
        </div>
      ))}
      {pending > 0 && (
        <div
          data-testid="outbox-notice"
          className="pointer-events-auto flex items-center gap-3 rounded-lg border border-watch bg-panel py-1 pl-3 pr-1 text-sm font-semibold text-watch shadow-lg print:hidden"
        >
          <span>{t('outbox.waiting', { n: pending })}</span>
          <button
            type="button"
            className="min-h-[44px] rounded-md border border-line px-3 text-ink hover:border-accent"
            onClick={() => void useApp.getState().flushOutbox({ manual: true })}
          >
            {t('outbox.sendNow')}
          </button>
        </div>
      )}
    </div>
  );
}
