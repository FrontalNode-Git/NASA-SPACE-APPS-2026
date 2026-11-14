import { driftText } from '../lib/attention';
import { isLit } from '../lib/lens';
import { useApp, useT } from '../lib/store';
import type { IndicatorView } from '../lib/types';
import { Chart, type ThemeColors } from './Chart';
import { Icon, indicatorIcon } from './Icon';
import { StatusBadge } from './StatusGlyph';
import { LockIcon, Tag } from './ui';

function fmt(value: number | null | undefined, decimals: number): string {
  return value === null || value === undefined ? '—' : value.toFixed(decimals);
}

function chartOption(view: IndicatorView, c: ThemeColors) {
  const series = view.series ?? [];
  const base = view.baseline;
  const values = series.flatMap((p) => (p.value === null ? [] : [p.value]));
  const lo = Math.min(...values, ...(base ? [base.mean - 2.4 * base.sd] : []));
  const hi = Math.max(...values, ...(base ? [base.mean + 2.4 * base.sd] : []));
  const statusColor = view.status === 'call_ground' ? c.call : view.status === 'watch' ? c.watch : c.nominal;
  return {
    grid: { left: 34, right: 8, top: 8, bottom: 20 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: c.panel,
      borderColor: c.line,
      textStyle: { color: c.text, fontSize: 12 },
    },
    xAxis: {
      type: 'category',
      data: series.map((p) => p.day),
      axisLine: { lineStyle: { color: c.line } },
      axisLabel: { color: c.muted, fontSize: 10 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      min: Number(lo.toFixed(2)),
      max: Number(hi.toFixed(2)),
      splitNumber: 2,
      axisLabel: { color: c.muted, fontSize: 10, formatter: (v: number) => v.toFixed(view.decimals) },
      splitLine: { lineStyle: { color: c.line, opacity: 0.4 } },
    },
    series: [
      {
        name: view.name,
        type: 'line',
        data: series.map((p) => p.value),
        symbolSize: 5,
        lineStyle: { color: c.text, width: 1.5 },
        itemStyle: { color: c.text },
        markArea: base
          ? {
              silent: true,
              itemStyle: { color: c.nominal, opacity: 0.14 },
              data: [[{ yAxis: base.mean - base.sd }, { yAxis: base.mean + base.sd }]],
            }
          : undefined,
        markLine: base
          ? {
              silent: true,
              symbol: 'none',
              label: { show: false },
              lineStyle: { color: c.muted, type: 'dotted', opacity: 0.7 },
              data: [{ yAxis: base.mean }],
            }
          : undefined,
      },
      {
        name: 'EWMA',
        type: 'line',
        data: series.map((p) => Number(p.ewma.toFixed(2))),
        symbol: 'none',
        smooth: true,
        lineStyle: { color: view.drift?.flag ? statusColor : c.accent, width: 2, type: 'dashed' },
      },
    ],
  };
}

/** One vital sign: the latest value against the crew member's own normal, with its trend. */
export function IndicatorCard({ view, highlight = false }: { view: IndicatorView; highlight?: boolean }) {
  const t = useT();
  const lens = useApp((s) => s.lens);
  const hazards = useApp((s) => s.bundle?.hazard_links.indicators[view.id]);
  const day = useApp((s) => s.day);
  const dim = !isLit(hazards, lens);
  const drift = driftText(t, view);

  return (
    <article
      id={`indicator-${view.id}`}
      className={`rounded-xl border bg-panel p-4 transition-opacity duration-300 ${dim ? 'opacity-25' : ''} ${
        highlight ? 'border-accent shadow-[0_0_0_1px_rgb(var(--accent))]' : 'border-line'
      }`}
      data-testid="indicator-card"
      data-indicator={view.id}
      data-dim={dim || undefined}
    >
      <header className="flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display font-semibold">
          <Icon name={indicatorIcon(view.id)} size={20} className="text-muted" />
          {view.name}
        </h3>
        <StatusBadge status={view.status} size="sm" />
      </header>

      {view.locked ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-bg/40 p-3 text-sm text-muted" data-testid="privacy-lock">
          <LockIcon />
          <p>{t('privacy.locked')}</p>
        </div>
      ) : (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold tabular-nums" data-testid="latest">
              {fmt(view.latest, view.decimals)}
            </span>
            <span className="text-sm text-muted">{view.unit}</span>
            {view.latest_source && (
              <span className="text-xs text-muted" data-testid="source" data-source={view.latest_source}>
                · {t(view.latest_source === 'manual' ? 'ind.entered' : 'ind.sensor')}
              </span>
            )}
            {view.private && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted" title={t('privacy.own')}>
                <LockIcon size={13} /> {t('privacy.onlyYou')}
              </span>
            )}
          </div>

          {view.baseline ? (
            <p className="text-sm text-muted">
              {t('ind.normal')}{' '}
              <span className="font-medium text-ink tabular-nums">
                {view.baseline.mean.toFixed(view.decimals + 1)} ± {view.baseline.sd.toFixed(view.decimals + 1)}
              </span>{' '}
              {view.unit}
            </p>
          ) : (
            <p className="text-sm text-muted">{t('ind.noBaseline')}</p>
          )}

          {drift && (
            <p className="mt-2 rounded-lg border border-watch/50 bg-watch/10 px-2.5 py-1.5 text-sm font-medium text-watch" data-testid="drift-message">
              {drift}
              {view.cusum?.flag && <span className="mt-0.5 block text-xs font-normal">{t('ind.cusum')}</span>}
            </p>
          )}
          {view.confidence?.missing_today && day > 0 && (
            <p className="mt-2 rounded-lg border border-line bg-bg/40 px-2.5 py-1.5 text-sm" data-testid="missing-reminder">
              {t('ind.missingToday')}
            </p>
          )}

          {(view.series?.length ?? 0) > 0 && (
            <div className="mt-2">
              <Chart
                label={t('ind.chartLabel', { name: view.name })}
                height={130}
                deps={[view]}
                option={(c) => chartOption(view, c)}
                table={{
                  columns: [t('chart.day'), `${view.name} (${view.unit})`, t('chart.trend')],
                  rows: (view.series ?? []).map((p) => [
                    p.day,
                    p.value === null ? t('chart.noReading') : p.value.toFixed(view.decimals),
                    p.ewma.toFixed(view.decimals + 1),
                  ]),
                }}
              />
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span data-testid="confidence">
              {t('ind.basedOn', { n: view.confidence?.baseline_readings ?? 0, m: view.confidence?.mission_readings ?? 0 })}
            </span>
            {view.calibrated_by_member && <Tag tone="accent">{t('ind.calibrated')}</Tag>}
          </div>
        </>
      )}
    </article>
  );
}
