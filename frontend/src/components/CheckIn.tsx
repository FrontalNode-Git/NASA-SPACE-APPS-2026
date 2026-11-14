import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useApp, useT } from '../lib/store';
import type { Dashboard, IndicatorView } from '../lib/types';
import { Icon, indicatorIcon } from './Icon';
import { Button, Panel } from './ui';

const MOOD = 'mood';

function onRecord(view: IndicatorView): string {
  return view.latest === null || view.latest === undefined ? '' : view.latest.toFixed(view.decimals);
}

/**
 * Daily check-in: the crew member confirms or enters the readings for the day in view.
 * This is the app's main input. An entered value replaces the sensor value for that day;
 * clearing a field withdraws the entry.
 */
export function CheckIn({ dash }: { dash: Dashboard }) {
  const t = useT();
  const log = useApp((s) => s.log);
  const fields = dash.indicators.filter((v) => !v.locked && v.id !== MOOD);
  const mood = dash.indicators.find((v) => v.id === MOOD && !v.locked);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Start again from what is on record whenever the day, the person or the saved values change.
  const record = `${dash.member.id}@${dash.day}|` + fields.map((v) => `${v.id}:${onRecord(v)}:${v.latest_source ?? ''}`).join('|');
  useEffect(() => {
    setDraft(Object.fromEntries(fields.map((v) => [v.id, onRecord(v)])));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record]);

  const changed = fields.filter((v) => (draft[v.id] ?? '').trim() !== onRecord(v));
  const unreadable = changed.some((v) => {
    const raw = (draft[v.id] ?? '').trim();
    return raw !== '' && !Number.isFinite(Number(raw));
  });

  const save = async () => {
    const values: Record<string, number | null> = {};
    for (const v of changed) {
      const raw = (draft[v.id] ?? '').trim();
      values[v.id] = raw === '' ? null : Number(raw);
    }
    setSaving(true);
    try {
      await api.saveReadings(dash.member.id, dash.day, values);
      await useApp.getState().refresh();
      useApp.getState().toast(t('checkin.saved'));
      setError(null);
    } catch {
      setError(t('checkin.invalid'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title={t('checkin.title', { n: dash.day })}>
      <form
        data-testid="check-in"
        onSubmit={(e) => {
          e.preventDefault();
          if (changed.length && !unreadable && !saving) void save();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {fields.map((v) => {
            const dirty = (draft[v.id] ?? '').trim() !== onRecord(v);
            return (
              <label
                key={v.id}
                className={`block rounded-lg border bg-bg/40 p-3 ${dirty ? 'border-accent' : 'border-line'}`}
                data-field={v.id}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Icon name={indicatorIcon(v.id)} size={18} className="text-muted" />
                  {v.name}
                </span>
                <span className="mt-2 flex items-baseline gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    step={v.decimals > 0 ? 1 / 10 ** v.decimals : 1}
                    value={draft[v.id] ?? ''}
                    onChange={(e) => setDraft({ ...draft, [v.id]: e.target.value })}
                    placeholder="—"
                    data-testid={`check-in-${v.id}`}
                    className="h-12 w-full min-w-0 rounded-md border border-line bg-bg px-2 font-display text-xl font-bold tabular-nums placeholder:text-muted"
                  />
                  <span className="shrink-0 text-sm text-muted">{v.unit}</span>
                </span>
                <span className="mt-1 block text-xs text-muted" data-source={v.latest_source ?? 'none'}>
                  {dirty
                    ? t('checkin.unsaved')
                    : v.latest_source === 'manual'
                      ? t('checkin.entered')
                      : v.latest_source === 'sensor'
                        ? t('checkin.sensor')
                        : t('checkin.missing')}
                </span>
              </label>
            );
          })}
        </div>

        {mood && (
          <div className="mt-4" data-field={MOOD}>
            <p className="text-sm font-medium">
              <Icon name={indicatorIcon(MOOD)} size={18} className="mr-2 align-[-3px] text-muted" />
              {t('quicklog.mood')}
            </p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t('quicklog.mood')}>
              {[1, 2, 3, 4, 5].map((value) => {
                const on = mood.latest === value && mood.latest_source === 'manual';
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={on}
                    aria-label={t('quicklog.moodValue', { n: value })}
                    data-testid={`check-in-mood-${value}`}
                    onClick={() => log('mood', { value })}
                    className={`min-h-[52px] min-w-[52px] rounded-lg border font-display text-xl font-bold ${
                      on ? 'border-accent bg-accent text-bg' : 'border-line bg-bg/50 hover:border-accent hover:text-accent'
                    }`}
                  >
                    {value}
                  </button>
                );
              })}
              <span className="self-center text-xs text-muted">
                {t('quicklog.low')} → {t('quicklog.high')}
              </span>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm text-call" role="alert">
            {error}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button primary disabled={changed.length === 0 || unreadable || saving} onClick={() => void save()} data-testid="check-in-save">
            {t('checkin.save')}
          </Button>
          <p className="text-xs text-muted">{t('checkin.hint')}</p>
        </div>
      </form>
    </Panel>
  );
}
