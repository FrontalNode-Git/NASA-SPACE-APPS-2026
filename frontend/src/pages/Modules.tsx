import { Pending } from '../components/Fact';
import { PageHeader, Panel, Tag } from '../components/ui';
import { useApp, useT } from '../lib/store';

/** Optional modules: feature flags and Pending screens only. No data and no numbers until approved. */
export function Modules() {
  const t = useT();
  const modules = useApp((s) => s.config?.modules ?? []);
  return (
    <div>
      <PageHeader title={t('modules.title')} lead={t('modules.lead')} />
      <div className="grid gap-4 md:grid-cols-2" data-testid="modules">
        {modules.map((m) => (
          <Panel key={m.id} title={m.title} action={<Tag tone={m.enabled ? 'accent' : 'muted'}>{m.enabled ? t('modules.on') : t('modules.off')}</Tag>}>
            <p className="text-sm text-muted">{m.summary}</p>
            <p className="my-2 text-xs text-muted">
              {t('modules.flag')}: <code>{m.id}</code>
            </p>
            <Pending id={m.id} reason={m.enabled ? t('modules.enabledPending') : t('modules.awaiting')} />
          </Panel>
        ))}
      </div>
    </div>
  );
}
