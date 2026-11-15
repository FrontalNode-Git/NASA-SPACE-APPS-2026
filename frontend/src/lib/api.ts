/**
 * The only place the frontend talks to the backend. Response shapes live in ./types.ts and
 * are pinned on the backend side by backend/tests/test_contract.py.
 */
import type { AppConfig, Bundle, CalibrationValues, CrewNotice, CrewReport, CrewTile, Dashboard, LogEntry, Report } from './types';

const API = '/api/v1';
const SESSION_KEY = 'vita-l-session';

/** An opaque id per browser, so everyone using the same deployment keeps their own logs. */
function sessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return 'default';
  }
}

const SESSION = sessionId();

/** A refused request. `detail` is the server's own sentence when it sent one, for example
 *  "Blood oxygen (SpO₂): that value cannot be right, please check it". */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail: string | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'X-Vital-Session': SESSION };
  if (init?.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + path, { ...init, headers });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const detail = (body as { detail?: unknown } | null)?.detail;
    throw new ApiError(`${res.status} ${res.statusText} for ${path}`, res.status, typeof detail === 'string' ? detail : null);
  }
  return (await res.json()) as T;
}

const qs = (params: Record<string, string | number>) =>
  '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();

export const api = {
  bundle: () => request<Bundle>('/content/bundle'),
  config: () => request<AppConfig>('/config'),
  dashboard: (member: string, viewer: string, day: number, seed: string) =>
    request<Dashboard>(`/members/${member}/dashboard${qs({ viewer, day, seed })}`),
  crew: (viewer: string, day: number, seed: string) => request<CrewTile[]>(`/crew${qs({ viewer, day, seed })}`),
  log: (member: string, body: { kind: LogEntry['kind']; day: number; value?: number; text?: string; entries?: string[] }) =>
    request<LogEntry>(`/members/${member}/logs${qs({ viewer: member })}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /** Daily check-in. A null value withdraws that entry, so the sensor value shows again. */
  saveReadings: (member: string, day: number, values: Record<string, number | null>) =>
    request<{ ok: boolean }>(`/members/${member}/readings${qs({ viewer: member })}`, {
      method: 'PUT',
      body: JSON.stringify({ day, values }),
    }),
  calibration: (member: string, seed: string) =>
    request<{ simulated: CalibrationValues; saved: CalibrationValues | null }>(
      `/members/${member}/calibration${qs({ viewer: member, seed })}`,
    ),
  saveCalibration: (member: string, values: CalibrationValues) =>
    request<{ saved: CalibrationValues }>(`/members/${member}/calibration${qs({ viewer: member })}`, {
      method: 'PUT',
      body: JSON.stringify({ values }),
    }),
  clearCalibration: (member: string) =>
    request<{ ok: boolean }>(`/members/${member}/calibration${qs({ viewer: member })}`, { method: 'DELETE' }),
  report: (member: string, day: number, seed: string) =>
    request<Report>(`/members/${member}/report${qs({ viewer: member, day, seed })}`),
  /** A plain link cannot send headers, so the printable report takes the session in the query. */
  reportHtmlUrl: (member: string, day: number, seed: string) =>
    `${API}/members/${member}/report.html${qs({ viewer: member, day, seed, session: SESSION })}`,
  /** Every member's report in one. The server gives it to the Chief Medical Officer only. */
  crewReport: (viewer: string, day: number, seed: string) => request<CrewReport>(`/crew/report${qs({ viewer, day, seed })}`),
  crewReportHtmlUrl: (viewer: string, day: number, seed: string) =>
    `${API}/crew/report.html${qs({ viewer, day, seed, session: SESSION })}`,
  /** The medical officer sends the day's crew report to the Commander. */
  notifyCommander: (viewer: string, day: number, seed: string) =>
    request<CrewNotice>(`/crew/report/notify${qs({ viewer, day, seed })}`, { method: 'POST' }),
  /** Crew reports this viewer sent or received, newest first. */
  crewNotices: (viewer: string) => request<CrewNotice[]>(`/crew/report/notices${qs({ viewer })}`),
  readNotice: (viewer: string, id: number) =>
    request<{ ok: boolean }>(`/crew/report/notices/${id}/read${qs({ viewer })}`, { method: 'POST' }),
  noticeHtmlUrl: (viewer: string, id: number) =>
    `${API}/crew/report/notices/${id}/report.html${qs({ viewer, session: SESSION })}`,
  resetDemo: () => request<{ ok: boolean }>('/demo/reset', { method: 'POST' }),
};
