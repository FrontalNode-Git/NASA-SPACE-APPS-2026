import { PageHeader, Panel, Tag } from '../components/ui';
import { useApp, useT } from '../lib/store';

/** Planned next: what the team means to add after this version. Nothing here has data yet. */
export function Modules() {
  const t = useT();
  const modules = useApp((s) => s.config?.modules ?? []);
  return (
    <div>
      <PageHeader title={t('modules.title')} lead={t('modules.lead')} />
      <div className="grid gap-4 md:grid-cols-2" data-testid="modules">
        {modules.map((m) => (
          <Panel
            key={m.id}
            title={m.title}
            action={<Tag tone={m.enabled ? 'accent' : 'muted'}>{t(m.enabled ? 'modules.on' : 'modules.planned')}</Tag>}
          >
            <p className="text-sm text-muted" data-testid="planned" data-module={m.id}>
              {m.summary}
            </p>
          </Panel>
        ))}
      </div>
    </div>
  );
}
