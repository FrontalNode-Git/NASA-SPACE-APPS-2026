import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { StatusBadge, StatusGlyph } from '../components/StatusGlyph';
import { Button, PageHeader, Panel, ProvisionalTag, SimulatedTag } from '../components/ui';
import { api } from '../lib/api';
import { useApp, useT } from '../lib/store';
import type { CrewReport, Report, ReportRow } from '../lib/types';

/** The one crew member who gets the report for the whole crew. The server enforces it too. */
const MEDICAL_OFFICER = 'cmo';

/** own: my daily summary. crew: everyone, for the medical officer. received: a crew report sent to me. */
type Scope = 'crew' | 'own' | 'received';
type Loaded = { scope: 'own'; report: Report } | { scope: 'crew' | 'received'; report: CrewReport };

const SCOPE_LABEL: Record<Scope, string> = {
  crew: 'report.scopeCrew',
  own: 'report.scopeOwn',
  received: 'report.scopeReceived',
};
const SCOPE_LEAD: Record<Scope, string> = {
  crew: 'report.crewLead',
  own: 'report.lead',
  received: 'report.receivedLead',
};

/**
 * Report for ground, ready to send. Every crew member gets their own daily summary. The
 * Chief Medical Officer also gets one report covering the whole crew and can send it to the
 * Commander. In a crew report, other members' mood values and notes stay private.
 */
export function ReportPage() {
  const t = useT();
  const viewer = useApp((s) => s.viewer);
  const day = useApp((s) => s.day);
  const seed = useApp((s) => s.seed);
  const dash = useApp((s) => s.dash);
  const notices = useApp((s) => s.notices);
  const toast = useApp((s) => s.toast);
  const [params] = useSearchParams();
  const isMedical = viewer === MEDICAL_OFFICER;
  const received = notices.filter((n) => n.to.id === viewer && n.report);
  const sent = notices.find((n) => n.from.id === viewer && n.day === day) ?? null;

  // The medical officer starts on the crew report. Everyone else starts on their own, unless
  // they came here from the "crew report received" notice.
  const [wanted, setWanted] = useState<Scope | null>(() => (params.has('received') ? 'received' : null));
  useEffect(() => {
    if (params.has('received')) setWanted('received');
  }, [params]);
  const choices: Scope[] = isMedical ? ['crew', 'own'] : received.length ? ['own', 'received'] : ['own'];
  const scope: Scope = wanted && choices.includes(wanted) ? wanted : isMedical ? 'crew' : 'own';

  const [noticeId, setNoticeId] = useState<number | null>(null);
  const notice = received.find((n) => n.id === noticeId) ?? received[0] ?? null;

  const [fetched, setFetched] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (scope === 'received') return; // already here: it came with the notice
    let live = true;
    setFailed(false);
    const load: Promise<Loaded> =
      scope === 'crew'
        ? api.crewReport(viewer, day, seed).then((report) => ({ scope, report }))
        : api.report(viewer, day, seed).then((report) => ({ scope, report }));
    load.then((r) => live && setFetched(r)).catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [viewer, day, seed, dash, scope]);

  // Opening a received report marks it as read, which clears the notice at the top of the app.
  const unreadId = scope === 'received' && notice && !notice.read ? notice.id : null;
  useEffect(() => {
    if (unreadId === null) return;
    api
      .readNotice(viewer, unreadId)
      .then(() => useApp.getState().refresh())
      .catch(() => undefined);
  }, [viewer, unreadId]);

  const loaded: Loaded | null =
    scope === 'received'
      ? notice?.report
        ? { scope, report: notice.report }
        : null
      : fetched?.scope === scope
        ? fetched
        : null;

  const copy = async () => {
    if (!loaded) return;
    try {
      await navigator.clipboard.writeText(loaded.report.text);
      toast(t('report.copied'));
    } catch {
      toast(t('report.copyFailed'), 'error');
    }
  };
  const download = () => {
    if (!loaded) return;
    const blob = new Blob([JSON.stringify(loaded.report, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download =
      loaded.scope === 'own'
        ? `vital-report-${loaded.report.member.id}-day-${loaded.report.mission_day}.json`
        : `vital-crew-report-day-${loaded.report.mission_day}.json`;
    a.click();
    URL.revokeObjectURL(href);
  };
  const print = () => {
    const url =
      scope === 'crew'
        ? api.crewReportHtmlUrl(viewer, day, seed)
        : scope === 'received' && notice
          ? api.noticeHtmlUrl(viewer, notice.id)
          : api.reportHtmlUrl(viewer, day, seed);
    window.open(url, '_blank', 'noopener');
  };
  const notify = async () => {
    setSending(true);
    try {
      await api.notifyCommander(viewer, day, seed);
      await useApp.getState().refresh();
      toast(t('report.notified'));
    } catch {
      toast(t('report.notifyFailed'), 'error');
    } finally {
      setSending(false);
    }
  };

  if (failed && scope !== 'received') return <p className="text-call">{t('toast.loadFailed')}</p>;
  // While another report loads, show nothing rather than the wrong one.
  if (!loaded) {
    return (
      <p className="text-muted" role="status">
        {t('app.loading')}
      </p>
    );
  }

  return (
    <div data-testid="report" data-scope={scope}>
      <PageHeader title={t('report.title')} lead={t(SCOPE_LEAD[scope])}>
        {choices.length > 1 && (
          <div className="mt-3 inline-flex rounded-lg border border-line p-1 print:hidden" role="group" aria-label={t('report.scope')} data-testid="report-scope">
            {choices.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={scope === s}
                data-scope-choice={s}
                onClick={() => setWanted(s)}
                className={`min-h-[44px] rounded-md px-4 text-sm font-semibold ${
                  scope === s ? 'bg-accent text-bg' : 'text-ink hover:text-accent'
                }`}
              >
                {t(SCOPE_LABEL[s])}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2 print:hidden">
          <Button primary onClick={() => void copy()} data-testid="report-copy">
            {t('report.copy')}
          </Button>
          <Button onClick={download} data-testid="report-json">
            {t('report.json')}
          </Button>
          <Button onClick={print} data-testid="report-print">
            {t('report.print')}
          </Button>
        </div>
        {scope === 'crew' && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 glass rounded-lg border border-line p-3 print:hidden" data-testid="report-notify">
            <Button primary={!sent} disabled={sending} onClick={() => void notify()} data-testid="report-notify-button">
              {t(sent ? 'report.notifyAgain' : 'report.notify')}
            </Button>
            <p className="min-w-0 flex-1 basis-56 text-sm text-muted" role="status">
              {sent ? t('report.notifiedAt', { at: sent.sent_at, n: sent.day }) : t('report.notifyHint')}
            </p>
          </div>
        )}
        {scope === 'received' && notice && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted" data-testid="report-received">
            <p>{t('report.receivedFrom', { from: `${notice.from.role} ${notice.from.name}`, at: notice.sent_at })}</p>
            {received.length > 1 && (
              <label className="flex items-center gap-2 print:hidden">
                <span className="sr-only">{t('report.receivedPick')}</span>
                <select
                  value={notice.id}
                  onChange={(e) => setNoticeId(Number(e.target.value))}
                  className="min-h-[44px] rounded-lg border border-line bg-bg px-2 text-ink"
                >
                  {received.map((n) => (
                    <option key={n.id} value={n.id}>
                      {t('common.day', { n: n.day })}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
      </PageHeader>

      {loaded.scope === 'own' ? (
        <MemberReport report={loaded.report} />
      ) : (
        <div data-testid="report-crew">
          <Panel>
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-display text-lg font-semibold">{t('report.crewOverall')}</p>
              <StatusBadge status={loaded.report.overall} size="lg" />
              <p className="text-sm text-muted">
                {t('common.day', { n: loaded.report.mission_day })} · {loaded.report.phase.name}
                <br />
                {loaded.report.generated_at}
              </p>
              <div className="ml-auto flex gap-2">
                <SimulatedTag />
                {loaded.report.method_status === 'provisional' && <ProvisionalTag />}
              </div>
            </div>
            <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2" data-testid="report-crew-summary">
              {loaded.report.members.map((m) => (
                <li key={m.member.id} className="flex items-center justify-between gap-3 border-t border-line/70 pt-1.5">
                  <button
                    type="button"
                    className="min-h-[36px] text-left underline-offset-2 hover:underline"
                    onClick={() => document.getElementById(`report-${m.member.id}`)?.scrollIntoView({ block: 'start' })}
                  >
                    <span className="text-muted">{m.member.role}</span> {m.member.name}
                  </button>
                  <span className="inline-flex shrink-0 items-center gap-1.5">
                    <StatusGlyph status={m.overall} size={12} />
                    {t(`status.${m.overall}`)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">{loaded.report.privacy}</p>
          </Panel>
          {loaded.report.members.map((m) => (
            <section key={m.member.id} id={`report-${m.member.id}`} data-member={m.member.id} className="mt-6 scroll-mt-24">
              <MemberReport report={m} inCrew />
            </section>
          ))}
        </div>
      )}

      <Panel className="mt-4" title={t('report.plain')}>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-bg/60 p-3 text-xs leading-relaxed" data-testid="report-text">
          {loaded.report.text}
        </pre>
      </Panel>
    </div>
  );
}

/** One crew member's report: who, overall status, every indicator, linked risks and notes. */
function MemberReport({ report, inCrew = false }: { report: Report; inCrew?: boolean }) {
  const t = useT();
  const own = !report.notes_private;
  const normalLabel = t(own ? 'report.normal' : 'report.normalOther');
  const latest = (row: ReportRow) =>
    row.private ? t('report.private') : row.missing_today ? t('chart.noReading') : `${row.latest} ${row.unit}`;
  const normal = (row: ReportRow) => (row.normal ? `${row.normal} · ${t('report.readings', { n: row.based_on })}` : '—');

  return (
    <>
      <Panel>
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-sm text-muted">{report.member.role}</p>
            <p className="font-display text-xl font-bold">{report.member.name}</p>
          </div>
          <StatusBadge status={report.overall} size="lg" />
          {!inCrew && (
            <p className="text-sm text-muted">
              {t('common.day', { n: report.mission_day })} · {report.phase.name}
              <br />
              {report.generated_at}
            </p>
          )}
          {!inCrew && (
            <div className="ml-auto flex gap-2">
              <SimulatedTag />
              {report.method_status === 'provisional' && <ProvisionalTag />}
            </div>
          )}
        </div>
        {report.acknowledged && <p className="mt-3 text-sm text-nominal">{t(own ? 'dash.acknowledged' : 'report.acknowledgedOther')}</p>}

        {/* Phone: one block per indicator, because five columns do not fit. Wider: the table. */}
        <ul className="mt-4 divide-y divide-line/70 border-t border-line/70 text-sm sm:hidden" aria-label={t('report.indicators')} data-testid="report-list">
          {report.indicators.map((row) => (
            <li key={row.id} className="py-3">
              <p className="flex items-center justify-between gap-3">
                <span className="font-medium">{row.name}</span>
                <span className="inline-flex shrink-0 items-center gap-1.5">
                  <StatusGlyph status={row.status} size={12} />
                  {t(`status.${row.status}`)}
                </span>
              </p>
              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                <dt className="text-muted">{t('report.latest')}</dt>
                <dd className="tabular-nums">{latest(row)}</dd>
                <dt className="text-muted">{normalLabel}</dt>
                <dd className="tabular-nums">{normal(row)}</dd>
                {row.drift && (
                  <>
                    <dt className="text-muted">{t('report.trend')}</dt>
                    <dd>{row.drift}</dd>
                  </>
                )}
              </dl>
            </li>
          ))}
        </ul>

        <div className="relative mt-4 hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[560px] text-left text-sm">
            <caption className="sr-only">{t('report.indicators')}</caption>
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="py-2 pr-3">{t('report.status')}</th>
                <th scope="col" className="py-2 pr-3">{t('report.indicator')}</th>
                <th scope="col" className="py-2 pr-3">{t('report.latest')}</th>
                <th scope="col" className="py-2 pr-3">{normalLabel}</th>
                <th scope="col" className="py-2">{t('report.trend')}</th>
              </tr>
            </thead>
            <tbody>
              {report.indicators.map((row) => (
                <tr key={row.id} className="border-t border-line/70">
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1.5">
                      <StatusGlyph status={row.status} size={12} />
                      {t(`status.${row.status}`)}
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-medium">{row.name}</td>
                  <td className="py-2 pr-3 tabular-nums">{latest(row)}</td>
                  <td className="py-2 pr-3 tabular-nums text-muted">{normal(row)}</td>
                  <td className="py-2">{row.drift ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title={t('report.risks')}>
          {report.linked_risks.length === 0 ? (
            <p className="text-sm text-muted">{t('report.noRisks')}</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm" data-testid="report-risks">
              {report.linked_risks.map((r) => (
                <li key={r.id}>{r.name}</li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={t('dash.notes')}>
          {report.notes_private ? (
            <p className="text-sm text-muted" data-testid="report-notes-private">
              {t('report.notesPrivate')}
            </p>
          ) : report.notes.length === 0 ? (
            <p className="text-sm text-muted">{t('dash.noNotes')}</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {report.notes.map((n, i) => (
                <li key={i}>
                  <span className="mr-2 text-xs tabular-nums text-muted">
                    {t('common.day', { n: n.day })} · {n.at}
                  </span>
                  {n.text ?? (n.kind === 'mood' ? t('log.mood', { n: n.value ?? 0 }) : t('log.ok'))}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
