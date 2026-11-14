import { describe, expect, it } from 'vitest';
import { attentionItems } from '../lib/attention';
import { translate } from '../lib/strings';
import type { Dashboard, IndicatorView } from '../lib/types';

const view = (patch: Partial<IndicatorView>): IndicatorView => ({
  id: 'heart_rate',
  name: 'Resting heart rate',
  unit: 'bpm',
  decimals: 0,
  private: false,
  locked: false,
  status: 'nominal',
  ...patch,
});
const dash = (indicators: IndicatorView[]) => ({ indicators }) as unknown as Dashboard;
const noDrift = { flag: false, direction: null, days: 0 };

describe('what needs attention', () => {
  it('lists nothing when every reading is nominal', () => {
    expect(attentionItems(dash([view({}), view({ id: 'spo2', z: 1.2 })]), translate)).toEqual([]);
  });

  it('explains a slow drift with the drift sentence alone', () => {
    const [item] = attentionItems(
      dash([view({ status: 'watch', z: 1.7, drift: { flag: true, direction: 'above', days: 5 } })]),
      translate,
    );
    expect(item).toEqual({
      id: 'heart_rate',
      name: 'Resting heart rate',
      status: 'watch',
      reason: 'Slowly drifting above your normal for 5 days',
    });
  });

  it('explains a watch without a drift by the side of the band the reading is on', () => {
    const [item] = attentionItems(dash([view({ status: 'watch', z: -2.3, drift: noDrift })]), translate);
    expect(item?.reason).toBe('Below your normal today');
  });

  it('puts call ground first and says the reading is far out, with the drift if there is one', () => {
    const items = attentionItems(
      dash([
        view({ id: 'sleep_hours', name: 'Sleep', status: 'watch', z: -2.1, drift: noDrift }),
        view({ status: 'call_ground', z: 6.5, drift: { flag: true, direction: 'above', days: 6 } }),
      ]),
      translate,
    );
    expect(items.map((i) => i.id)).toEqual(['heart_rate', 'sleep_hours']);
    expect(items[0]?.reason).toBe('Far above your normal today · Slowly drifting above your normal for 6 days');
  });

  it('gives no reason for a private reading the viewer may not see', () => {
    const [item] = attentionItems(dash([view({ id: 'mood', name: 'Mood (self-report)', private: true, locked: true, status: 'watch' })]), translate);
    expect(item?.status).toBe('watch');
    expect(item?.reason).toBeNull();
  });
});
