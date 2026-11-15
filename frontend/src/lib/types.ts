export type Status = 'nominal' | 'watch' | 'call_ground';
export type CoverageLevel = 'monitored' | 'partial' | 'pending';
export type LinkKind = 'indicators' | 'zones' | 'hazards' | 'risks';

export interface Fact {
  id: string;
  text: string;
  quote: string;
  url: string;
  page_title: string;
  fetched_at: string;
  links: Record<LinkKind, string[]>;
  value?: { number: number; unit: string };
}

export interface Hazard {
  id: string;
  short: string;
  name: string;
  url: string;
  fact_ids: string[];
}

export interface Risk {
  id: string;
  name: string;
  category: 'physiology' | 'behavioral' | 'radiation';
  url: string;
  fact_id: string;
  hazards: string[];
  zones: string[];
}

export type StudyGroup = 'artemis-ii' | 'leo' | 'past';

export interface Study {
  id: string;
  name: string;
  group: StudyGroup;
  url: string;
  fact_id: string;
  hazards: string[];
  zones: string[];
  risks: string[];
  indicators: string[];
}

export interface IndicatorDef {
  id: string;
  name: string;
  unit: string;
  decimals: number;
  resolution: number;
  zones: string[];
  risks: string[];
  private: boolean;
}

export interface Zone {
  id: string;
  name: string;
  anchor: [number, number, number];
}

export interface Environment {
  id: string;
  name: string;
  fact_ids: string[];
}

export interface Phase {
  id: string;
  name: string;
  start: number;
  end: number;
  environment: string | null;
  basis_fact_ids: string[];
}

export interface Mission {
  name: string;
  note: string;
  total_days: number;
  basis_fact_ids: string[];
  phases: Phase[];
}

export interface Feature {
  id: string;
  name: string;
  kind: 'measure' | 'zones' | 'hazards';
}

export interface CrewMember {
  id: string;
  name: string;
  role: string;
}

export interface PendingItem {
  id: string;
  where: string;
  reason: string;
  resolve: string;
}

export interface CoverageRow {
  risk_id: string;
  level: CoverageLevel;
  indicators: string[];
  cells: Record<string, CoverageLevel>;
}

export interface Coverage {
  total: number;
  monitored: number;
  partial: number;
  pending: number;
  rows: CoverageRow[];
}

export type HazardLinkKind = 'risks' | 'studies' | 'indicators' | 'zones' | 'environments';

export interface Bundle {
  facts: Fact[];
  hazards: Hazard[];
  risks: Risk[];
  research: Study[];
  method_status: 'provisional' | 'approved';
  crew: CrewMember[];
  indicators: IndicatorDef[];
  zones: Zone[];
  environments: Environment[];
  mission: Mission;
  features: Feature[];
  slots: { id: string; where: string; reason: string }[];
  hazard_links: Record<HazardLinkKind, Record<string, string[]>>;
  pending: PendingItem[];
  coverage: Coverage;
}

export interface SeriesPoint {
  day: number;
  value: number | null;
  ewma: number;
  upper: number;
  lower: number;
}

export interface DriftInfo {
  flag: boolean;
  direction: 'above' | 'below' | null;
  days: number;
}

export interface IndicatorView {
  id: string;
  name: string;
  unit: string;
  decimals: number;
  private: boolean;
  locked: boolean;
  status: Status;
  calibrated_by_member?: boolean;
  /** Where today's value came from: the crew member's check-in, or the sensor feed. */
  latest_source?: 'manual' | 'sensor' | null;
  preflight?: (number | null)[];
  confidence?: {
    baseline_readings: number;
    mission_readings: number;
    missing_today: boolean;
    missing_days: number[];
  };
  baseline?: { mean: number; sd: number; n: number } | null;
  latest?: number | null;
  z?: number | null;
  drift?: DriftInfo;
  cusum?: DriftInfo;
  series?: SeriesPoint[];
}

export interface LogEntry {
  id: number;
  kind: 'mood' | 'entry' | 'ok' | 'note';
  day: number;
  at: string;
  value: number | null;
  text: string | null;
  simulated: boolean;
}

export interface Checkin {
  day: number;
  at: string;
  simulated: boolean;
}

export interface Dashboard {
  member: CrewMember;
  viewer: string;
  own: boolean;
  day: number;
  seed: string;
  phase: { id: string; name: string; environment: string | null };
  simulated: boolean;
  method_status: string;
  overall: Status;
  acknowledged: boolean;
  last_checkin: Checkin | null;
  indicators: IndicatorView[];
  logs: LogEntry[];
  logs_locked: boolean;
}

export interface CrewTile {
  id: string;
  name: string;
  role: string;
  is_self: boolean;
  overall: Status;
  needs_attention: boolean;
  acknowledged: boolean;
  watch: number;
  call_ground: number;
  last_checkin: Checkin | null;
}

export interface ReportRow {
  id: string;
  name: string;
  unit: string;
  status: Status;
  status_label: string;
  /** Someone else's private indicator: only the status level is reported. */
  private: boolean;
  latest: string;
  normal: string | null;
  drift: string | null;
  based_on: number;
  missing_today: boolean;
  risk_ids: string[];
}

export interface Report {
  title: string;
  simulated: boolean;
  disclaimer: string;
  method_status: string;
  generated_at: string;
  member: CrewMember;
  mission_day: number;
  phase: { id: string; name: string };
  seed: string;
  overall: Status;
  overall_label: string;
  acknowledged: boolean;
  indicators: ReportRow[];
  drifts: string[];
  missing: string[];
  notes: { day: number; at: string; kind: string; text: string | null; value: number | null }[];
  /** True when the reader is not the member: their notes are left out. */
  notes_private: boolean;
  linked_risks: { id: string; name: string }[];
  text: string;
}

/** The report for the whole crew, for the Chief Medical Officer: one full report per member. */
export interface CrewReport {
  title: string;
  simulated: boolean;
  disclaimer: string;
  privacy: string;
  method_status: string;
  generated_at: string;
  requested_by: CrewMember;
  mission_day: number;
  phase: { id: string; name: string };
  seed: string;
  overall: Status;
  overall_label: string;
  attention: CrewMember[];
  members: Report[];
  text: string;
}

/** A crew report the medical officer sent to the Commander. Only the recipient gets `report`. */
export interface CrewNotice {
  id: number;
  from: CrewMember;
  to: CrewMember;
  day: number;
  sent_at: string;
  overall: Status;
  read: boolean;
  report: CrewReport | null;
}

export interface ModuleFlag {
  id: string;
  enabled: boolean;
  title: string;
  summary: string;
}

export interface AppConfig {
  modules: ModuleFlag[];
  demo_day: number;
  max_day: number;
  preflight_days: number;
  seeds: { id: string; label: string }[];
}

export type CalibrationValues = Record<string, (number | null)[]>;
