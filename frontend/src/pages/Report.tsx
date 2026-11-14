import { useEffect, useState } from 'react';
import { StatusBadge, StatusGlyph } from '../components/StatusGlyph';
import { Button, PageHeader, Panel, ProvisionalTag, SimulatedTag } from '../components/ui';
import { api } from '../lib/api';
import { useApp, useT } from '../lib/store';
import type { Report } from '../lib/types';

/** Report for ground: the signed-in crew member's own daily summary, ready to send. */
export function ReportPage() {
  const t = useT();
  const viewer = useApp((s) => s.viewer);
  const day = useApp((s) => s.day);
  const seed = useApp((s) => s.seed);
  const dash = useApp((s) => s.dash);
  const toast = useApp((s) => s.toast);
  const [report, setReport] = useState<Report | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    api
      .report(viewer, day, seed)
      .then((r) => live && setReport(r))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [viewer, day, seed, dash]);

  const copy = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.text);
      toast(t('report.copied'));
    } catch {
      toast(t('report.copyFailed'), 'error');
    }
  };
  const download = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `vita-l-report-${report.member.id}-day-${report.mission_day}.json`;
    a.click();
    URL.revokeObjectURL(href);
  };
  const print = () => window.open(api.reportHtmlUrl(viewer, day, seed), '_blank', 'noopener');

  if (failed) return <p className="text-call">{t('toast.loadFailed')}</p>;
  if (!report) {
    return (
      <p className="text-muted" role="status">
        {t('app.loading')}
      </p>
    );
  }

  return (
    <div data-testid="report">
      <PageHeader title={t('report.title')} lead={t('report.lead')}>
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
      </PageHeader>

      <Panel>
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-sm text-muted">{report.member.role}</p>
            <p className="font-display text-xl font-bold">{report.member.name}</p>
          </div>
          <StatusBadge status={report.overall} size="lg" />
          <p className="text-sm text-muted">
            {t('common.day', { n: report.mission_day })} · {report.phase.name}
            <br />
            {report.generated_at}
          </p>
          <div className="ml-auto flex gap-2">
            <SimulatedTag />
            {report.method_status === 'provisional' && <ProvisionalTag />}
          </div>
        </div>
        {report.acknowledged && <p className="mt-3 text-sm text-nominal">{t('dash.acknowledged')}</p>}

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
                <dd className="tabular-nums">{row.missing_today ? t('chart.noReading') : `${row.latest} ${row.unit}`}</dd>
                <dt className="text-muted">{t('report.normal')}</dt>
                <dd className="tabular-nums">
                  {row.normal ? `${row.normal} · ${t('report.readings', { n: row.based_on })}` : '—'}
                </dd>
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
                <th scope="col" className="py-2 pr-3">{t('report.normal')}</th>
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
                  <td className="py-2 pr-3 tabular-nums">
                    {row.missing_today ? t('chart.noReading') : `${row.latest} ${row.unit}`}
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-muted">
                    {row.normal ? `${row.normal} · ${t('report.readings', { n: row.based_on })}` : '—'}
                  </td>
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
          {report.notes.length === 0 ? (
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

      <Panel className="mt-4" title={t('report.plain')}>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-bg/60 p-3 text-xs leading-relaxed" data-testid="report-text">
          {report.text}
        </pre>
      </Panel>
    </div>
  );
}
