import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { isRetriable, newId } from '../lib/outbox';
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
 *
 * Kept short on purpose (one row of fields on a laptop, two per row on a phone) so the
 * body scan and the charts below it start on the first screen.
 */
export function CheckIn({ dash }: { dash: Dashboard }) {
  const t = useT();
  const log = useApp((s) => s.log);
  const fields = dash.indicators.filter((v) => !v.locked && v.id !== MOOD);
  const mood = dash.indicators.find((v) => v.id === MOOD && !v.locked);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null); // the field the server would not take
  const [saving, setSaving] = useState(false);

  // Start again from what is on record whenever the day, the person or the saved values change.
  const record = `${dash.member.id}@${dash.day}|` + fields.map((v) => `${v.id}:${onRecord(v)}:${v.latest_source ?? ''}`).join('|');
  useEffect(() => {
    setDraft(Object.fromEntries(fields.map((v) => [v.id, onRecord(v)])));
    setError(null);
    setRefused(null);
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
      setRefused(null);
    } catch (err) {
      if (isRetriable(err)) {
        // Server not reached: keep the check-in on this device and send it when it answers.
        useApp.getState().enqueue({ id: newId(), kind: 'readings', member: dash.member.id, day: dash.day, values });
        setError(null);
        return;
      }
      // The server starts its sentence with the name of the vital it refused.
      const detail = err instanceof ApiError ? err.detail : null;
      const field = detail ? changed.find((v) => detail.startsWith(`${v.name}:`)) : undefined;
      setRefused(field?.id ?? null);
      setError(field && detail ? (detail.endsWith('.') ? detail : `${detail}.`) : t('checkin.invalid'));
    } finally {
      setSaving(false);
    }
  };

  const edit = (id: string, value: string) => {
    setDraft({ ...draft, [id]: value });
    if (refused === id) {
      setRefused(null);
      setError(null);
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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
          {fields.map((v, i) => {
            const dirty = (draft[v.id] ?? '').trim() !== onRecord(v);
            const bad = refused === v.id;
            // On a phone (two per row) an odd field left over at the end takes the full row.
            const alone = i === fields.length - 1 && fields.length % 2 === 1 ? 'col-span-2 sm:col-span-1' : '';
            return (
              <label
                key={v.id}
                className={`flex flex-col rounded-lg border bg-bg/40 p-2.5 sm:p-3 ${alone} ${bad ? 'border-call' : dirty ? 'border-accent' : 'border-line'}`}
                data-field={v.id}
                data-refused={bad || undefined}
              >
                <span className="flex items-start gap-2 text-sm font-medium leading-tight">
                  <Icon name={indicatorIcon(v.id)} size={18} className="shrink-0 text-muted" />
                  {v.name}
                </span>
                <span className="mt-auto flex items-baseline gap-2 pt-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    step={v.decimals > 0 ? 1 / 10 ** v.decimals : 1}
                    value={draft[v.id] ?? ''}
                    onChange={(e) => edit(v.id, e.target.value)}
                    placeholder="—"
                    aria-invalid={bad || undefined}
                    data-testid={`check-in-${v.id}`}
                    className="h-11 w-full min-w-0 rounded-md border border-line bg-bg px-2 font-display text-xl font-bold tabular-nums placeholder:text-muted"
                  />
                  <span className="shrink-0 text-sm text-muted">{v.unit}</span>
                </span>
                <span className={`mt-1 block text-xs ${bad ? 'text-call' : 'text-muted'}`} data-source={v.latest_source ?? 'none'}>
                  {bad
                    ? t('checkin.refused')
                    : dirty
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

        {error && (
          <p className="mt-3 text-sm text-call" role="alert">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-4">
          {mood && (
            <div data-field={MOOD}>
              <p className="text-sm font-medium">
                <Icon name={indicatorIcon(MOOD)} size={18} className="mr-2 align-[-3px] text-muted" />
                {t('quicklog.mood')}
                <span className="ml-2 whitespace-nowrap text-xs font-normal text-muted">
                  {t('quicklog.low')} → {t('quicklog.high')}
                </span>
              </p>
              <div className="mt-2 flex gap-2" role="group" aria-label={t('quicklog.mood')}>
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
                      className={`h-12 w-12 rounded-lg border font-display text-xl font-bold ${
                        on ? 'border-accent bg-accent text-bg' : 'border-line bg-bg/50 hover:border-accent hover:text-accent'
                      }`}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex min-w-0 flex-1 basis-72 flex-wrap items-center gap-x-3 gap-y-2">
            <Button
              primary
              className="h-12"
              disabled={changed.length === 0 || unreadable || saving}
              onClick={() => void save()}
              data-testid="check-in-save"
            >
              {t('checkin.save')}
            </Button>
            <p className="min-w-0 max-w-sm flex-1 basis-48 text-xs text-muted">{t('checkin.hint')}</p>
          </div>
        </div>
      </form>
    </Panel>
  );
}
