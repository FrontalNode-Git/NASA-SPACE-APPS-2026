import { useEffect, useState } from 'react';
import { driftText } from '../lib/attention';
import { isLit } from '../lib/lens';
import { useApp, useT } from '../lib/store';
import type { IndicatorView } from '../lib/types';
import { usePhone } from '../lib/usePhone';
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

/** What the marks on every chart mean. Shown once, above the cards. */
export function ChartLegend() {
  const t = useT();
  return (
    <ul
      className="flex flex-wrap items-center gap-x-5 gap-y-1.5 glass rounded-lg border border-line px-3 py-2 text-xs text-muted"
      aria-label={t('legend.title')}
      data-testid="chart-legend"
    >
      <li className="flex items-center gap-1.5">
        <svg width="26" height="12" viewBox="0 0 26 12" aria-hidden="true" className="text-ink">
          <path d="M1 6h24" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="13" cy="6" r="2.6" fill="currentColor" />
        </svg>
        {t('legend.reading')}
      </li>
      <li className="flex items-center gap-1.5">
        <svg width="26" height="12" viewBox="0 0 26 12" aria-hidden="true" className="text-accent">
          <path d="M1 6h24" stroke="currentColor" strokeWidth="2" strokeDasharray="5 3" />
        </svg>
        {t('legend.trend')}
      </li>
      <li className="flex items-center gap-1.5">
        <svg width="26" height="12" viewBox="0 0 26 12" aria-hidden="true" className="text-nominal">
          <rect x="1" y="1" width="24" height="10" rx="2" fill="currentColor" opacity="0.3" />
        </svg>
        {t('legend.normal')}
      </li>
      <li>{t('legend.axis')}</li>
    </ul>
  );
}

/** The last readings as a small line over the personal band, for the compact phone row. */
function Sparkline({ view }: { view: IndicatorView }) {
  const points = (view.series ?? []).map((p) => p.value);
  const values = points.flatMap((v) => (v === null ? [] : [v]));
  if (values.length < 2) return null;
  const base = view.baseline;
  const lo = Math.min(...values, ...(base ? [base.mean - base.sd] : []));
  const hi = Math.max(...values, ...(base ? [base.mean + base.sd] : []));
  const W = 76;
  const H = 26;
  const y = (v: number) => (hi === lo ? H / 2 : H - 2 - ((v - lo) / (hi - lo)) * (H - 4));
  const x = (i: number) => (i / (points.length - 1)) * W;
  const line = points.flatMap((v, i) => (v === null ? [] : [`${x(i).toFixed(1)},${y(v).toFixed(1)}`])).join(' ');
  const tone = view.status === 'call_ground' ? 'text-call' : view.status === 'watch' ? 'text-watch' : 'text-ink';
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="shrink-0" data-testid="sparkline">
      {base && (
        <rect x="0" y={y(base.mean + base.sd)} width={W} height={Math.max(2, y(base.mean - base.sd) - y(base.mean + base.sd))} className="fill-nominal" opacity="0.22" />
      )}
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className={tone} />
    </svg>
  );
}

/**
 * One vital sign: the latest value against the crew member's own normal, with its trend.
 *
 * On a phone the card is a compact row (value, status, a small trend line); a tap opens the
 * full chart. Anything that needs attention (a drift, a missing reading) shows either way.
 */
export function IndicatorCard({ view, highlight = false }: { view: IndicatorView; highlight?: boolean }) {
  const t = useT();
  const lens = useApp((s) => s.lens);
  const hazards = useApp((s) => s.bundle?.hazard_links.indicators[view.id]);
  const day = useApp((s) => s.day);
  const phone = usePhone();
  const [opened, setOpened] = useState(false);
  const dim = !isLit(hazards, lens);
  const drift = driftText(t, view);
  const open = !phone || opened;
  const canToggle = phone && !view.locked;

  // A card opened from the "needs attention" list, or by a link to it, shows its chart.
  useEffect(() => {
    if (highlight) setOpened(true);
  }, [highlight]);

  // A mood is never read by a sensor: until the crew member logs one it is a simulated value.
  const sourceKey = view.latest_source === 'manual' ? 'ind.entered' : view.id === 'mood' ? 'ind.simulated' : 'ind.sensor';

  return (
    <article
      id={`indicator-${view.id}`}
      className={`glass rounded-xl border p-4 transition-opacity duration-300 ${dim ? 'opacity-25' : ''} ${
        highlight ? 'border-accent shadow-[0_0_0_1px_rgb(var(--accent))]' : 'border-line'
      }`}
      data-testid="indicator-card"
      data-indicator={view.id}
      data-dim={dim || undefined}
      data-open={open}
    >
      {/* On a phone the whole top of the card opens and closes it; the button is its keyboard handle. */}
      <div onClick={canToggle ? () => setOpened(!opened) : undefined} className={canToggle ? 'cursor-pointer' : undefined}>
        <header className="flex items-start justify-between gap-2">
          <h3 className="flex items-center gap-2 font-display font-semibold">
            <Icon name={indicatorIcon(view.id)} size={20} className="text-muted" />
            {view.name}
          </h3>
          <StatusBadge status={view.status} size="sm" />
        </header>

        {!view.locked && (
          <div className="mt-2 flex items-center gap-2">
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <span className="font-display text-3xl font-bold tabular-nums" data-testid="latest">
                {fmt(view.latest, view.decimals)}
              </span>
              <span className="text-sm text-muted">{view.unit}</span>
              {view.latest_source && (
                <span className="text-xs text-muted" data-testid="source" data-source={view.latest_source}>
                  · {t(sourceKey)}
                </span>
              )}
            </span>
            {view.private && open && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted" title={t('privacy.own')}>
                <LockIcon size={13} /> {t('privacy.onlyYou')}
              </span>
            )}
            {canToggle && (
              <span className="ml-auto flex shrink-0 items-center gap-1">
                {!open && <Sparkline view={view} />}
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={`indicator-details-${view.id}`}
                  aria-label={t(open ? 'ind.hideDetails' : 'ind.showDetails', { name: view.name })}
                  data-testid="indicator-toggle"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpened(!opened);
                  }}
                  className="flex h-11 w-9 items-center justify-center rounded-lg text-muted"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
                    <path d="M3.5 6l4.5 4.5L12.5 6" />
                  </svg>
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {view.locked ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-bg/40 p-3 text-sm text-muted" data-testid="privacy-lock">
          <LockIcon />
          <p>{t('privacy.locked')}</p>
        </div>
      ) : (
        <>
          {drift && (
            <p className="mt-2 rounded-lg border border-watch/50 bg-watch/10 px-2.5 py-1.5 text-sm font-medium text-watch" data-testid="drift-message">
              {drift}
              {view.cusum?.flag && (
                <span className="mt-0.5 block text-xs font-normal">
                  <span title={t('ind.cusumMethods')} className="cursor-help underline decoration-dotted underline-offset-2" data-testid="drift-checks">
                    {t('ind.cusum')}
                  </span>
                </span>
              )}
            </p>
          )}
          {view.confidence?.missing_today && day > 0 && (
            <p className="mt-2 rounded-lg border border-line bg-bg/40 px-2.5 py-1.5 text-sm" data-testid="missing-reminder">
              {t('ind.missingToday')}
            </p>
          )}

          {open && (
            <div id={`indicator-details-${view.id}`} data-testid="indicator-details">
              {view.baseline ? (
                <p className="mt-1 text-sm text-muted">
                  {t('ind.normal')}{' '}
                  <span className="font-medium text-ink tabular-nums">
                    {view.baseline.mean.toFixed(view.decimals + 1)} ± {view.baseline.sd.toFixed(view.decimals + 1)}
                  </span>{' '}
                  {view.unit}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted">{t('ind.noBaseline')}</p>
              )}

              {(view.series?.length ?? 0) > 0 && (
                <div className="mt-2">
                  <Chart
                    label={t('ind.chartLabel', { name: view.name })}
                    height={112}
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

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <span data-testid="confidence">
                  {t('ind.basedOn', { n: view.confidence?.baseline_readings ?? 0, m: view.confidence?.mission_readings ?? 0 })}
                </span>
                {view.calibrated_by_member && <Tag tone="accent">{t('ind.calibrated')}</Tag>}
              </div>
            </div>
          )}
        </>
      )}
    </article>
  );
}
