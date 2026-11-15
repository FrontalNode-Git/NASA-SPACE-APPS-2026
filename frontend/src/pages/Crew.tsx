import { useNavigate } from 'react-router-dom';
import { STATUS_META, StatusBadge } from '../components/StatusGlyph';
import { SameReading } from '../components/SameReading';
import { LockIcon, PageHeader, Panel, SimulatedTag, Tag } from '../components/ui';
import { useApp, useT } from '../lib/store';

/** Crew view for the Chief Medical Officer: status level per member, most urgent first. */
export function Crew() {
  const t = useT();
  const crew = useApp((s) => s.crew);
  const viewer = useApp((s) => s.viewer);
  const bundle = useApp((s) => s.bundle);
  const setMember = useApp((s) => s.setMember);
  const navigate = useNavigate();
  const me = bundle?.crew.find((m) => m.id === viewer);

  return (
    <div>
      <PageHeader title={t('crew.title')} lead={t('crew.lead')}>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
          <SimulatedTag />
          <span>{t('crew.viewingAs', { role: me?.role ?? '' })}</span>
        </div>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="crew-grid">
        {(crew ?? []).map((tile) => (
          <button
            key={tile.id}
            type="button"
            data-testid="crew-tile"
            data-member={tile.id}
            data-status={tile.overall}
            onClick={() => {
              setMember(tile.id);
              navigate('/');
            }}
            className={`flex flex-col items-stretch justify-start rounded-xl border bg-panel p-4 text-left transition hover:border-accent ${
              tile.needs_attention ? STATUS_META[tile.overall].ring : 'border-line'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm text-muted">{tile.role}</p>
                <p className="font-display text-xl font-bold">{tile.name}</p>
              </div>
              {tile.is_self && <Tag>{t('crew.you')}</Tag>}
            </div>
            <div className="mt-3">
              <StatusBadge status={tile.overall} size="lg" />
            </div>
            <p className="mt-3 min-h-[1.25rem] text-sm font-medium">
              {tile.needs_attention ? (
                <span className={STATUS_META[tile.overall].text}>
                  {t('crew.attention', { n: tile.watch + tile.call_ground })}
                  {tile.acknowledged ? ` · ${t('crew.acknowledged')}` : ''}
                </span>
              ) : (
                <span className="text-muted">{t('crew.allNormal')}</span>
              )}
            </p>
            <p className="mt-1 text-sm text-muted">
              {tile.last_checkin
                ? t('dash.lastCheckin', { day: tile.last_checkin.day, at: tile.last_checkin.at })
                : t('dash.noCheckin')}
            </p>
            <p className="mt-3 text-sm font-semibold text-accent">{t('crew.open')} →</p>
          </button>
        ))}
      </div>

      <SameReading />

      <Panel className="mt-4" title={t('crew.privacyTitle')}>
        <div className="flex items-start gap-3 text-sm" data-testid="privacy-note">
          <LockIcon size={20} />
          <p className="max-w-3xl">{t('crew.privacy')}</p>
        </div>
      </Panel>
    </div>
  );
}
