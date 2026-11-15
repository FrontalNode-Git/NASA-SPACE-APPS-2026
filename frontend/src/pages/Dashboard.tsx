import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Attention } from '../components/Attention';
import { BodyPanel } from '../components/BodyPanel';
import { CheckIn } from '../components/CheckIn';
import { ChartLegend, IndicatorCard } from '../components/IndicatorCard';
import { LensBar } from '../components/LensBar';
import { StatusBadge } from '../components/StatusGlyph';
import { Button, LockIcon, Panel, ProvisionalTag } from '../components/ui';
import { useApp, useT } from '../lib/store';
import type { LogEntry } from '../lib/types';

function logText(t: ReturnType<typeof useT>, entry: LogEntry): string {
  if (entry.kind === 'mood') return t('log.mood', { n: entry.value ?? 0 });
  if (entry.kind === 'ok') return t('log.ok');
  return entry.text ?? '';
}

/** The crew member's day: check in, see every vital against their own normal, review the log. */
export function Dashboard() {
  const t = useT();
  const dash = useApp((s) => s.dash);
  const viewer = useApp((s) => s.viewer);
  const setMember = useApp((s) => s.setMember);
  const [params] = useSearchParams();
  const focus = params.get('indicator');
  // The card last opened from the "needs attention" list. Kept apart from `focus` so that
  // saving a check-in afterwards does not scroll the page back to it.
  const [jumped, setJumped] = useState<string | null>(null);
  const memberId = dash?.member.id;
  const day = dash?.day;

  useEffect(() => {
    if (!focus || !dash) return;
    document.getElementById(`indicator-${focus}`)?.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, [focus, dash]);
  useEffect(() => {
    setJumped(null);
  }, [memberId, day]);

  const jump = (indicator: string) => {
    setJumped(indicator);
    document.getElementById(`indicator-${indicator}`)?.scrollIntoView({ block: 'center', behavior: 'auto' });
  };

  if (!dash) {
    return (
      <p className="text-muted" role="status">
        {t('app.loading')}
      </p>
    );
  }
  const checkin = dash.last_checkin;

  return (
    <div className="space-y-4" data-testid="dashboard">
      <Panel>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="min-w-0">
            <p className="text-sm text-muted">{dash.member.role}</p>
            <h1 className="font-display text-2xl font-bold tracking-tight" data-testid="member-name">
              {dash.member.name}
            </h1>
          </div>
          <StatusBadge status={dash.overall} size="lg" />
          <div className="text-sm text-muted">
            <p>
              {t('common.day', { n: dash.day })} · {dash.phase.name}
            </p>
            <p data-testid="last-checkin">
              {checkin
                ? t('dash.lastCheckin', { day: checkin.day, at: checkin.at }) + (checkin.simulated ? ` (${t('tag.simulatedShort')})` : '')
                : t('dash.noCheckin')}
            </p>
          </div>
          {/* "Simulated data" is already in the header and under every check-in field. */}
          {dash.method_status === 'provisional' && (
            <div className="ml-auto">
              <ProvisionalTag />
            </div>
          )}
        </div>
        {dash.day >= 1 && <Attention dash={dash} onJump={jump} />}
        {dash.acknowledged && (
          <p className="mt-3 rounded-lg border border-nominal/50 bg-nominal/10 px-3 py-2 text-sm text-nominal" data-testid="acknowledged">
            {t('dash.acknowledged')}
          </p>
        )}
        {!dash.own && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-bg/40 px-3 py-2 text-sm" data-testid="viewing-other">
            <LockIcon />
            <span className="flex-1">{t('dash.viewingOther', { name: dash.member.name })}</span>
            <Button onClick={() => setMember(viewer)}>{t('dash.backToMine')}</Button>
          </div>
        )}
        {dash.day === 0 && (
          <p className="mt-3 rounded-lg border border-line bg-bg/40 px-3 py-2 text-sm">
            {t('dash.preflight')}{' '}
            <Link to="/calibrate" className="underline decoration-accent underline-offset-2">
              {t('nav.calibrate')}
            </Link>
          </p>
        )}
      </Panel>

      {dash.own && dash.day >= 1 && <CheckIn dash={dash} />}

      <LensBar />

      {/* Stacked (phone, tablet): the vitals come first. Side by side (laptop): body scan on the
          left, and the notes panel stretches so both columns end together. */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="order-2 flex flex-col gap-4 xl:order-1">
          <BodyPanel />
          <Panel title={t('dash.notes')} className="xl:flex-1">
            {dash.logs_locked ? (
              <div className="flex items-start gap-2 text-sm text-muted" data-testid="notes-locked">
                <LockIcon />
                <p>{t('privacy.notesLocked')}</p>
              </div>
            ) : dash.logs.length === 0 ? (
              <p className="text-sm text-muted">{t('dash.noNotes')}</p>
            ) : (
              <ul className="space-y-2 text-sm" data-testid="notes">
                {dash.logs.slice(0, 8).map((entry) => (
                  <li key={`${entry.id}-${entry.day}`} className="flex gap-3">
                    <span className="w-24 shrink-0 text-xs tabular-nums text-muted">
                      {t('common.day', { n: entry.day })} · {entry.at}
                    </span>
                    <span>{logText(t, entry)}</span>
                  </li>
                ))}
              </ul>
            )}
            {!dash.logs_locked && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
                <LockIcon size={13} /> {t('privacy.own')}
              </p>
            )}
          </Panel>
        </div>
        <div className="order-1 grid content-start gap-4 md:grid-cols-2 xl:order-2" data-testid="indicator-grid">
          <div className="md:col-span-2">
            <ChartLegend />
          </div>
          {dash.indicators.map((view) => (
            <IndicatorCard key={view.id} view={view} highlight={focus === view.id || jumped === view.id} />
          ))}
          <p className="text-xs text-muted md:col-span-2">{t('dash.method')}</p>
        </div>
      </div>
    </div>
  );
}
