import { lazy, Suspense, useId, useMemo, useState } from 'react';
import { insidePoints, outlineLoops, webglAvailable, zoneAnchors, zoneStatuses } from '../lib/body';
import { beatRate } from '../lib/heartbeat';
import { litIds } from '../lib/lens';
import { useApp, useT } from '../lib/store';
import { prefersReducedMotion } from './Chart';
import type { Status, Zone } from '../lib/types';
import type { ScanCard } from './BodyScan';
import { STATUS_META, StatusBadge, StatusGlyph } from './StatusGlyph';
import { Panel } from './ui';

const BodyScan = lazy(() => import('./BodyScan'));

const SCALE = 58;
const px = (x: number) => 130 + x * SCALE;
const py = (y: number) => 118 - y * SCALE;

interface ZoneViewProps {
  zones: Zone[];
  statuses: Record<string, Status>;
  lit: string[];
  lensActive: boolean;
  selected: string | null;
  onSelect: (zone: string | null) => void;
  /** The resting heart rate on screen; the heart pulses at this rate. */
  heartBpm?: number | null;
}

const toPath = (loops: [number, number][][]) =>
  loops.map((loop) => `M${loop.map(([x, y]) => `${px(x).toFixed(1)} ${py(y).toFixed(1)}`).join('L')}Z`).join('');

/** The flat figure is traced from the same body as the particle view, once. */
let flatFigure: { outline: string; inner: string; structures: [string, string][] } | null = null;
function traceFigure() {
  flatFigure ??= {
    outline: toPath(outlineLoops(0)),
    inner: toPath(outlineLoops(0.045)),
    // Each particle of the skeleton and organs becomes a dot: a zero-length line with round ends.
    structures: Object.entries(insidePoints()).map(([zone, points]) => [
      zone,
      points.map(([x, y]) => `M${px(x).toFixed(1)} ${py(y).toFixed(1)}h0`).join(''),
    ]),
  };
  return flatFigure;
}

/** Flat figure for devices without WebGL, or by choice. Same body, same zones, same statuses. */
function BodyScan2D({ zones, statuses, lit, lensActive, selected, onSelect, heartBpm }: ZoneViewProps) {
  const id = useId();
  const figure = traceFigure();
  const rate = beatRate(heartBpm);
  return (
    <svg viewBox="0 0 260 236" className="h-full w-full" aria-hidden="true" data-testid="flat-figure">
      <g className="text-muted">
        <defs>
          <pattern id={`${id}-lines`} width="6" height="2" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0.5" x2="6" y2="0.5" stroke="currentColor" strokeWidth="0.45" />
          </pattern>
        </defs>
        <path d={figure.outline} fill="currentColor" fillOpacity={0.09} />
        <path d={figure.outline} fill={`url(#${id}-lines)`} opacity={0.3} />
        <path d={figure.inner} fill="none" stroke="currentColor" strokeOpacity={0.28} strokeWidth={0.5} />
        <path d={figure.outline} fill="none" stroke="currentColor" strokeOpacity={0.9} strokeWidth={0.9} strokeLinejoin="round" data-outline />
      </g>
      {figure.structures.map(([zoneId, dots]) => {
        const status = statuses[zoneId] ?? 'nominal';
        const dim = lensActive && !lit.includes(zoneId);
        const tone = lensActive || selected === zoneId ? 'text-accent' : STATUS_META[status].text;
        return (
          <path
            key={zoneId}
            d={dots}
            // The heart and its vessels beat at the resting heart rate, once the person has one.
            className={`${tone}${zoneId === 'heart' && rate !== null ? ' heart-beat' : ''}`}
            style={zoneId === 'heart' && rate !== null ? { animationDuration: `${(1 / rate).toFixed(3)}s` } : undefined}
            fill="none"
            stroke="currentColor"
            strokeWidth={0.85}
            strokeLinecap="round"
            opacity={dim ? 0.12 : status === 'nominal' && selected !== zoneId ? 0.5 : 0.9}
          />
        );
      })}
      {zones
        .filter((z) => z.id !== 'whole_body')
        .flatMap((zone) => {
          const status = statuses[zone.id] ?? 'nominal';
          const dim = lensActive && !lit.includes(zone.id);
          const on = selected === zone.id;
          return zoneAnchors(zone).map((a, i) => (
            <g
              key={`${zone.id}-${i}`}
              transform={`translate(${px(a[0])} ${py(a[1])})`}
              opacity={dim ? 0.25 : 1}
              className={`cursor-pointer ${on ? 'text-accent' : STATUS_META[status].text}`}
              onClick={() => onSelect(on ? null : zone.id)}
            >
              <circle r={11} fill="transparent" />
              {status === 'watch' ? (
                <path d="M0 -7 6.5 5H-6.5Z" fill="currentColor" />
              ) : status === 'call_ground' ? (
                <rect x={-5.5} y={-5.5} width={11} height={11} rx={1} fill="currentColor" />
              ) : (
                <circle r={on ? 4.6 : 3.1} fill="currentColor" />
              )}
              {on && <circle r={10} fill="none" stroke="currentColor" strokeWidth={1.4} />}
            </g>
          ));
        })}
    </svg>
  );
}

/** Text twin of the scan: every zone is a real button, so screen readers and keyboards get everything. */
function ZoneList({ zones, statuses, lit, lensActive, selected, onSelect }: ZoneViewProps) {
  const t = useT();
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={t('scan.zoneList')}>
      {zones.map((zone) => {
        const status = statuses[zone.id] ?? 'nominal';
        const dim = lensActive && !lit.includes(zone.id);
        const on = selected === zone.id;
        return (
          <li key={zone.id}>
            <button
              type="button"
              data-zone={zone.id}
              data-dim={dim || undefined}
              aria-pressed={on}
              aria-label={`${zone.name}: ${t(STATUS_META[status].key)}`}
              onClick={() => onSelect(on ? null : zone.id)}
              className={`flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 text-sm transition ${
                on ? 'border-accent bg-accent/15' : 'border-line bg-bg/40 hover:border-accent'
              } ${dim ? 'opacity-30' : ''}`}
            >
              <StatusGlyph status={status} size={11} />
              {zone.name}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ZoneDetail({ zone, status }: { zone: Zone; status: Status }) {
  const t = useT();
  const bundle = useApp((s) => s.bundle);
  const dash = useApp((s) => s.dash);
  if (!bundle) return null;
  const indicators = (dash?.indicators ?? []).filter((v) => bundle.indicators.find((d) => d.id === v.id)?.zones.includes(zone.id));
  const risks = bundle.risks.filter((r) => r.zones.includes(zone.id));

  return (
    <div className="mt-4 border-t border-line pt-4" data-testid="zone-detail">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-lg font-semibold">{zone.name}</h3>
        <StatusBadge status={status} size="sm" />
      </div>
      {indicators.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {indicators.map((v) => (
            <li key={v.id} className="flex items-center gap-2">
              <StatusGlyph status={v.status} size={11} />
              <a href={`#indicator-${v.id}`} className="underline decoration-line underline-offset-2 hover:text-accent">
                {v.name}
              </a>
              {!v.locked && v.latest !== null && v.latest !== undefined && (
                <span className="tabular-nums text-muted">
                  {v.latest.toFixed(v.decimals)} {v.unit}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {risks.length > 0 && (
        <div className="mt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">{t('scan.risks')}</h4>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
            {risks.map((r) => (
              <li key={r.id}>{r.name}</li>
            ))}
          </ul>
        </div>
      )}
      {indicators.length === 0 && risks.length === 0 && (
        <p className="mt-2 text-sm text-muted">{t('scan.nothing')}</p>
      )}
    </div>
  );
}

export function BodyPanel() {
  const t = useT();
  const bundle = useApp((s) => s.bundle);
  const dash = useApp((s) => s.dash);
  const lens = useApp((s) => s.lens);
  const selected = useApp((s) => s.selectedZone);
  const select = useApp((s) => s.selectZone);
  const view2d = useApp((s) => s.view2d);
  const night = useApp((s) => s.night);
  const set = useApp((s) => s.set);
  const [hasWebgl] = useState(webglAvailable);

  const statuses = useMemo(() => (bundle ? zoneStatuses(bundle, dash) : {}), [bundle, dash]);
  const lit = useMemo(() => (bundle ? litIds(bundle, 'zones', lens) : []), [bundle, lens]);
  if (!bundle) return null;

  const cards: ScanCard[] = (dash?.indicators ?? [])
    .filter((v) => ['heart_rate', 'spo2', 'temperature'].includes(v.id) && !v.locked)
    .map((v) => ({
      id: v.id,
      label: t(`scan.card.${v.id}`),
      value: v.latest === null || v.latest === undefined ? '—' : v.latest.toFixed(v.decimals),
      unit: v.unit,
      status: v.status,
    }));
  const flat = view2d || !hasWebgl;
  const heart = (dash?.indicators ?? []).find((v) => v.id === 'heart_rate' && !v.locked);
  const heartBpm = heart?.latest ?? null;
  const beating = beatRate(heartBpm) !== null && !prefersReducedMotion();
  const shared: ZoneViewProps = { zones: bundle.zones, statuses, lit, lensActive: lens.length > 0, selected, onSelect: select, heartBpm };
  const zone = bundle.zones.find((z) => z.id === selected);

  return (
    <Panel
      title={t('scan.title')}
      action={
        <button
          type="button"
          onClick={() => set({ view2d: !view2d })}
          disabled={!hasWebgl}
          aria-pressed={flat}
          className="min-h-[36px] rounded-md border border-line px-2.5 text-xs text-muted hover:text-ink disabled:opacity-50"
        >
          {flat ? t('scan.view3d') : t('scan.view2d')}
        </button>
      }
    >
      <div className="scan-stage relative h-[430px] overflow-hidden rounded-lg" data-testid="body-scan" data-mode={flat ? '2d' : '3d'} data-heart-bpm={beating ? heartBpm : undefined}>
        {flat ? (
          <BodyScan2D {...shared} />
        ) : (
          <Suspense fallback={<BodyScan2D {...shared} />}>
            <BodyScan {...shared} cards={cards} night={night} />
          </Suspense>
        )}
        {!hasWebgl && <p className="absolute bottom-2 left-2 text-xs text-muted">{t('scan.noWebgl')}</p>}
      </div>
      <ZoneList {...shared} />
      {zone && <ZoneDetail zone={zone} status={statuses[zone.id] ?? 'nominal'} />}
    </Panel>
  );
}
