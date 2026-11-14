import { attentionItems } from '../lib/attention';
import { useApp, useT } from '../lib/store';
import type { Dashboard } from '../lib/types';
import { StatusGlyph } from './StatusGlyph';
import { Button, LockIcon } from './ui';

/**
 * The first thing the dashboard says: which readings are off this person's normal and why,
 * each one a jump to its card. When the status is Call ground and the crew member has not
 * answered yet, the "I'm OK" action sits right here instead of only in the quick bar.
 */
export function Attention({ dash, onJump }: { dash: Dashboard; onJump: (indicator: string) => void }) {
  const t = useT();
  const run = useApp((s) => s.run);
  const items = attentionItems(dash, t);
  const needsAnswer = dash.own && dash.overall === 'call_ground' && !dash.acknowledged;

  return (
    <div className="mt-3 border-t border-line/70 pt-2" data-testid="attention">
      {needsAnswer && (
        <div
          className="mb-2 mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-call/60 bg-call/10 px-3 py-2.5"
          role="alert"
          data-testid="attention-banner"
        >
          <StatusGlyph status="call_ground" size={18} />
          <p className="min-w-0 flex-1 basis-52 text-sm">
            <strong className="font-semibold text-call">{t('status.call_ground')}.</strong> {t('attention.call')}
          </p>
          <Button primary onClick={() => run({ type: 'ok' })} data-testid="attention-ok">
            {t('action.ok')}
          </Button>
        </div>
      )}
      {items.length === 0 ? (
        <p className="flex min-h-[36px] items-center gap-2 text-sm text-muted" data-testid="attention-none">
          <StatusGlyph status="nominal" size={12} />
          {t('attention.none')}
        </p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onJump(item.id)}
                className="-mx-2 flex min-h-[40px] w-[calc(100%+1rem)] items-center gap-2.5 rounded-lg px-2 py-1 text-left text-sm hover:bg-bg/60"
                data-attention={item.id}
                data-status={item.status}
              >
                <StatusGlyph status={item.status} size={14} title={t(`status.${item.status}`)} />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{item.name}</span>
                  <span className="mx-1.5 text-muted" aria-hidden="true">
                    ·
                  </span>
                  {item.reason ? (
                    <span>{item.reason}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-muted">
                      <LockIcon size={13} /> {t('attention.private')}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs font-medium text-accent">
                  {t('attention.show')} <span aria-hidden="true">↓</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
