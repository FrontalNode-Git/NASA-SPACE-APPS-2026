import { lazy, Suspense, useMemo, useState } from 'react';
import { BODY_PARTS, webglAvailable, zoneAnchors, zoneStatuses } from '../lib/body';
import { litIds } from '../lib/lens';
import { useApp, useT } from '../lib/store';
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
}

/** Flat figure for devices without WebGL, or by choice. Same zones, same statuses. */
function BodyScan2D({ zones, statuses, lit, lensActive, selected, onSelect }: ZoneViewProps) {
  return (
    <svg viewBox="0 0 260 236" className="h-full w-full" aria-hidden="true">
      <g className="text-muted" fill="currentColor" opacity={0.28} stroke="currentColor" strokeLinecap="round">
        {BODY_PARTS.map((part, i) =>
          part.kind === 'ellipsoid' ? (
            <ellipse key={i} cx={px(part.c[0])} cy={py(part.c[1])} rx={part.r[0] * SCALE} ry={part.r[1] * SCALE} stroke="none" />
          ) : (
            <line
              key={i}
              x1={px(part.a[0])}
              y1={py(part.a[1])}
              x2={px(part.b[0])}
              y2={py(part.b[1])}
              strokeWidth={part.r * 2 * SCALE}
              fill="none"
            />
          ),
        )}
      </g>
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
                <circle r={on ? 5 : 3.6} fill="currentColor" />
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
  const shared: ZoneViewProps = { zones: bundle.zones, statuses, lit, lensActive: lens.length > 0, selected, onSelect: select };
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
      <div className="relative h-[430px] overflow-hidden rounded-lg bg-bg/60" data-testid="body-scan" data-mode={flat ? '2d' : '3d'}>
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
