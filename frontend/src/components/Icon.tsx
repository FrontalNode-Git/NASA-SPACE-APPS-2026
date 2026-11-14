import cardiogram from '../assets/icons/cardiogram.svg';
import chat from '../assets/icons/chat.svg';
import doctor from '../assets/icons/doctor.svg';
import firstAidKit from '../assets/icons/first-aid-kit.svg';
import heart from '../assets/icons/heart.svg';
import lungs from '../assets/icons/lungs.svg';
import measuringTape from '../assets/icons/measuring-tape.svg';
import medicalRecord from '../assets/icons/medical-record.svg';
import medicalReport from '../assets/icons/medical-report.svg';
import mentalHealth from '../assets/icons/mental-health.svg';
import mic from '../assets/icons/mic.svg';
import running from '../assets/icons/running.svg';
import search from '../assets/icons/search.svg';
import sight from '../assets/icons/sight.svg';
import sleep from '../assets/icons/sleep.svg';
import smartwatch from '../assets/icons/smartwatch.svg';
import thermometer from '../assets/icons/thermometer.svg';

const ICONS = {
  cardiogram,
  chat,
  doctor,
  'first-aid-kit': firstAidKit,
  heart,
  lungs,
  'measuring-tape': measuringTape,
  'medical-record': medicalRecord,
  'medical-report': medicalReport,
  'mental-health': mentalHealth,
  mic,
  running,
  search,
  sight,
  sleep,
  smartwatch,
  thermometer,
} as const;

export type IconName = keyof typeof ICONS;

/** Which glyph stands for each vital sign. Anything unmapped falls back to the cardiogram. */
const INDICATOR_ICONS: Record<string, IconName> = {
  heart_rate: 'heart',
  spo2: 'lungs',
  temperature: 'thermometer',
  sleep_hours: 'sleep',
  exercise_minutes: 'running',
  mood: 'mental-health',
};

export function indicatorIcon(indicatorId: string): IconName {
  return INDICATOR_ICONS[indicatorId] ?? 'cardiogram';
}

/**
 * Decorative glyph. The SVG is used as a mask over the current text colour, so one file
 * serves the day theme, the night theme and every status colour. Always paired with text.
 */
export function Icon({ name, size = 18, className = '' }: { name: IconName; size?: number; className?: string }) {
  const mask = `url("${ICONS[name]}") center / contain no-repeat`;
  return (
    <span
      aria-hidden="true"
      data-icon={name}
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{ width: size, height: size, WebkitMask: mask, mask }}
    />
  );
}
