import { useEffect, useState } from 'react';
import { Fact, FactList, useFacts } from '../components/Fact';
import { MissionScrubber } from '../components/MissionScrubber';
import { PageHeader, Panel, Tag } from '../components/ui';
import { emphasisedHazards } from '../lib/lens';
import { useApp, useT } from '../lib/store';

/** What the mission screen will show once a sourced fact exists for it. */
const ahead = [
  { id: 'distance-comm-delay', title: 'mission.delay' },
  { id: 'radiation-dose-rate', title: 'mission.dose' },
];

/** Mission timeline and environments. Its shape uses sourced facts only; the rest is planned. */
export function Mission() {
  const t = useT();
  const bundle = useApp((s) => s.bundle);
  const day = useApp((s) => s.day);
  const setLens = useApp((s) => s.setLens);
  const navigate = useApp((s) => s.navigate);
  const phase = bundle?.mission.phases.find((p) => day >= p.start && day <= p.end);
  const [envId, setEnvId] = useState<string | null>(phase?.environment ?? null);
  const facts = useFacts();

  useEffect(() => {
    setEnvId(phase?.environment ?? null);
  }, [phase?.environment]);

  if (!bundle) return null;
  const emphasised = emphasisedHazards(bundle, day);
  const env = bundle.environments.find((e) => e.id === envId);
  const basis = [...new Set([...bundle.mission.basis_fact_ids, ...(phase?.basis_fact_ids ?? [])])];
  // A sentence already shown for the current phase is not repeated under Environments.
  const fresh = env ? env.fact_ids.filter((id) => !basis.includes(id)) : [];
  const envFacts = fresh.length > 0 ? fresh : (env?.fact_ids ?? []);

  return (
    <div>
      <PageHeader title={t('mission.title')} lead={bundle.mission.name}>
        <p className="mt-1 max-w-3xl text-sm text-muted">{bundle.mission.note}</p>
      </PageHeader>

      <Panel>
        <MissionScrubber />
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title={phase?.name ?? ''} action={<Tag tone="accent">{t('mission.phase')}</Tag>}>
          {basis.length > 0 ? <FactList ids={basis} /> : <p className="text-sm text-muted">{t('mission.earth')}</p>}
          <div className="mt-4 border-t border-line pt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{t('mission.emphasised')}</h3>
            {emphasised.length === 0 ? (
              <p className="mt-1 text-sm text-muted">{t('mission.noEmphasis')}</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2" data-testid="emphasised-hazards">
                {bundle.hazards
                  .filter((h) => emphasised.includes(h.id))
                  .map((h) => (
                    <span key={h.id} className="rounded-full border border-accent/60 px-3 py-1 text-sm text-accent" data-hazard={h.id}>
                      {h.name}
                    </span>
                  ))}
                <button
                  type="button"
                  onClick={() => {
                    setLens(emphasised);
                    navigate('/');
                  }}
                  className="min-h-[36px] rounded-full border border-line px-3 text-sm hover:border-accent"
                >
                  {t('mission.applyLens')}
                </button>
              </div>
            )}
          </div>
        </Panel>

        <Panel title={t('mission.environments')}>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('mission.environments')}>
            {bundle.environments.map((e) => {
              const current = e.id === phase?.environment;
              const on = e.id === envId;
              return (
                <button
                  key={e.id}
                  type="button"
                  data-env={e.id}
                  data-current={current || undefined}
                  aria-pressed={on}
                  onClick={() => setEnvId(e.id)}
                  className={`min-h-[40px] rounded-full border px-3.5 text-sm font-medium ${
                    on ? 'border-accent bg-accent/15 text-ink' : 'border-line text-muted hover:text-ink'
                  }`}
                >
                  {e.name}
                  {current && <span className="ml-1.5 text-xs text-accent">● {t('mission.now')}</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-4" data-testid="environment-facts">
            {env ? <FactList ids={envFacts} /> : <p className="text-sm text-muted">{t('mission.pickEnv')}</p>}
          </div>
        </Panel>

        {/* Anything with a sourced fact is shown as a panel. What is still missing is listed once, quietly. */}
        {ahead.filter((x) => facts.has(x.id)).map((x) => (
          <Panel key={x.id} title={t(x.title)}>
            <Fact id={x.id} />
          </Panel>
        ))}
        {ahead.some((x) => !facts.has(x.id)) && (
          <Panel title={t('mission.planned')} className="lg:col-span-2">
            <ul className="flex flex-wrap gap-x-8 gap-y-1 text-sm text-muted" data-testid="mission-planned">
              {ahead
                .filter((x) => !facts.has(x.id))
                .map((x) => (
                  <li key={x.id} data-pending-id={x.id}>
                    {t(x.title)}
                  </li>
                ))}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}
