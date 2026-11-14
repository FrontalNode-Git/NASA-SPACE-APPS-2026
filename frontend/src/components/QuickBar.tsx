import { useEffect, useRef, useState } from 'react';
import { parseVoice } from '../lib/commands';
import { useApp, useT } from '../lib/store';
import { listenOnce, voiceSupported } from '../lib/voice';
import { Icon, type IconName } from './Icon';
import { Button } from './ui';

/** Persistent actions: every one is a single tap or key from any screen (min 52 px targets). */
export function QuickBar() {
  const t = useT();
  const run = useApp((s) => s.run);
  const set = useApp((s) => s.set);
  const lensOn = useApp((s) => s.lens.length > 0);
  const [listening, setListening] = useState(false);
  const stop = useRef<() => void>(() => undefined);
  const canListen = voiceSupported();

  useEffect(() => () => stop.current(), []);

  const voice = () => {
    if (listening) {
      stop.current();
      return;
    }
    setListening(true);
    stop.current = listenOnce({
      onPhrase: (phrase) => {
        const { bundle, toast, t: tr } = useApp.getState();
        const command = bundle ? parseVoice(phrase, bundle) : null;
        if (command) {
          run(command);
          if (command.type !== 'log_mood' && command.type !== 'ok') toast(tr('voice.heard', { phrase }));
        } else {
          toast(tr('voice.unknown', { phrase }), 'error');
        }
      },
      onError: () => useApp.getState().toast(useApp.getState().t('voice.error'), 'error'),
      onEnd: () => setListening(false),
    });
  };

  const actions: { id: string; icon: IconName; label: string; short: string; key: string; onClick: () => void; pressed?: boolean }[] = [
    { id: 'quick-log', icon: 'medical-record', label: t('action.quickLog'), short: t('short.quickLog'), key: 'L', onClick: () => run({ type: 'quick_log' }) },
    { id: 'ok', icon: 'chat', label: t('action.ok'), short: t('action.ok'), key: 'K', onClick: () => run({ type: 'ok' }) },
    { id: 'report', icon: 'medical-report', label: t('action.report'), short: t('short.report'), key: 'R', onClick: () => run({ type: 'report' }) },
    { id: 'lens', icon: 'sight', label: t('action.lens'), short: t('short.lens'), key: 'H', onClick: () => run({ type: 'toggle_lens' }), pressed: lensOn },
    { id: 'palette', icon: 'search', label: t('action.palette'), short: t('short.palette'), key: '/', onClick: () => set({ paletteOpen: true }) },
  ];

  return (
    <nav
      aria-label={t('quick.title')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 backdrop-blur print:hidden"
      data-testid="quick-bar"
    >
      <div className="mx-auto flex max-w-[1500px] items-stretch gap-1.5 px-2 py-1.5 sm:justify-center sm:gap-2">
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            data-quick={a.id}
            aria-pressed={a.pressed}
            aria-keyshortcuts={a.key}
            aria-label={a.label}
            onClick={a.onClick}
            className={`flex min-h-[52px] min-w-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 text-[11px] font-semibold leading-tight transition sm:flex-none sm:flex-row sm:gap-2 sm:px-4 sm:text-sm ${
              a.id === 'ok'
                ? 'border-nominal/60 bg-nominal/10 text-nominal hover:bg-nominal/20'
                : a.pressed
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-line bg-bg/50 text-ink hover:border-accent'
            }`}
          >
            <Icon name={a.icon} size={18} />
            <span className="sm:hidden">{a.short}</span>
            <span className="hidden sm:inline">{a.label}</span>
            <kbd className="hidden rounded border border-line px-1.5 text-xs font-normal text-muted sm:inline">{a.key}</kbd>
          </button>
        ))}
        <button
          type="button"
          data-quick="voice"
          onClick={voice}
          disabled={!canListen}
          aria-pressed={listening}
          title={canListen ? t('voice.hint') : t('voice.unsupported')}
          className={`flex min-h-[52px] min-w-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 text-[11px] font-semibold leading-tight transition disabled:opacity-40 sm:flex-none sm:flex-row sm:gap-2 sm:px-4 sm:text-sm ${
            listening ? 'border-accent bg-accent text-bg' : 'border-line bg-bg/50 text-ink hover:border-accent'
          }`}
        >
          <Icon name="mic" size={18} />
          <span>{listening ? t('voice.listening') : t('voice.button')}</span>
        </button>
      </div>
    </nav>
  );
}

const ENTRY_KEYS = ['entry.exercise', 'entry.sleptWell', 'entry.sleptPoorly', 'entry.ateWell', 'entry.tired', 'entry.energised'];

/** Quick log: open (1 tap or L), then one tap on a mood or an entry saves and closes. */
export function QuickLog() {
  const t = useT();
  const open = useApp((s) => s.quickLogOpen);
  const viewer = useApp((s) => s.viewer);
  const crew = useApp((s) => s.bundle?.crew);
  const day = useApp((s) => s.day);
  const [note, setNote] = useState('');
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) first.current?.focus();
    else setNote('');
  }, [open]);

  if (!open) return null;
  const close = () => useApp.setState({ quickLogOpen: false });
  const save = (kind: 'mood' | 'entry' | 'note', extra: { value?: number; text?: string }) => {
    useApp.getState().log(kind, extra);
    close();
  };
  const me = crew?.find((m) => m.id === viewer);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('quicklog.title')}
        className="w-full max-w-md rounded-2xl border border-line bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="quick-log"
      >
        <h2 className="font-display text-lg font-semibold">{t('quicklog.title')}</h2>
        <p className="text-sm text-muted">
          {me ? `${me.role} ${me.name}` : ''} · {t('common.day', { n: day })}
        </p>

        <h3 className="mt-4 text-sm font-semibold">{t('quicklog.mood')}</h3>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              ref={value === 1 ? first : undefined}
              type="button"
              data-mood={value}
              onClick={() => save('mood', { value })}
              aria-label={t('quicklog.moodValue', { n: value })}
              className="min-h-[52px] rounded-lg border border-line bg-bg/50 font-display text-xl font-bold hover:border-accent hover:text-accent"
            >
              {value}
            </button>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted">
          <span>{t('quicklog.low')}</span>
          <span>{t('quicklog.high')}</span>
        </div>

        <h3 className="mt-4 text-sm font-semibold">{t('quicklog.entries')}</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {ENTRY_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => save('entry', { text: t(key) })}
              className="min-h-[52px] rounded-lg border border-line bg-bg/50 px-3 text-sm hover:border-accent"
            >
              {t(key)}
            </button>
          ))}
        </div>

        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (note.trim()) save('note', { text: note.trim() });
          }}
        >
          <label className="sr-only" htmlFor="quick-note">
            {t('quicklog.note')}
          </label>
          <input
            id="quick-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={280}
            placeholder={t('quicklog.note')}
            className="min-h-[44px] flex-1 rounded-lg border border-line bg-bg px-3 text-sm placeholder:text-muted"
          />
          <Button primary disabled={!note.trim()} onClick={() => note.trim() && save('note', { text: note.trim() })}>
            {t('common.save')}
          </Button>
        </form>
        <p className="mt-3 flex items-center gap-1 text-xs text-muted">{t('privacy.own')}</p>
        <div className="mt-3 text-right">
          <button type="button" onClick={close} className="min-h-[44px] px-3 text-sm text-muted underline underline-offset-2">
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
