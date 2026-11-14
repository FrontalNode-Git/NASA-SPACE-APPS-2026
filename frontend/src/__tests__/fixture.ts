import type { Bundle } from '../lib/types';

/** A small bundle with the same shape as /api/v1/content/bundle. */
export const bundle = {
  facts: [],
  hazards: [
    { id: 'radiation', short: 'Radiation', name: 'Space Radiation', url: 'https://example.test/r', fact_ids: [] },
    { id: 'isolation', short: 'Isolation', name: 'Isolation and Confinement', url: 'https://example.test/i', fact_ids: [] },
    { id: 'distance', short: 'Distance', name: 'Distance from Earth', url: 'https://example.test/d', fact_ids: [] },
    { id: 'gravity', short: 'Gravity', name: 'Gravity Fields', url: 'https://example.test/g', fact_ids: [] },
    { id: 'hostile', short: 'Hostile environment', name: 'Hostile/Closed Environments', url: 'https://example.test/h', fact_ids: [] },
  ],
  risks: [
    { id: 'bone', name: 'Risk of Spaceflight-Induced Bone Changes', category: 'physiology', url: 'https://example.test/bone', fact_id: 'risk-bone', hazards: ['gravity'], zones: ['bones'] },
    { id: 'sleep', name: 'Risk of Inadequate Sleep and Irregular Schedules', category: 'behavioral', url: 'https://example.test/sleep', fact_id: 'risk-sleep', hazards: [], zones: [] },
  ],
  research: [
    { id: 'zero-t2', name: 'Zero T2', group: 'leo', url: 'https://example.test/z', fact_id: 'study-zero-t2', hazards: [], zones: ['muscles'], risks: ['fitness'], indicators: [] },
    { id: 'space-gardening', name: 'Space Gardening', group: 'past', url: 'https://example.test/s', fact_id: 'study-sg', hazards: ['isolation'], zones: ['brain'], risks: [], indicators: [] },
  ],
  method_status: 'provisional',
  crew: [
    { id: 'cmo', name: 'N. Okafor', role: 'Chief Medical Officer' },
    { id: 'engineer', name: 'M. Ruiz', role: 'Flight Engineer' },
  ],
  indicators: [
    { id: 'heart_rate', name: 'Resting heart rate', unit: 'bpm', decimals: 0, resolution: 1, zones: ['heart'], risks: ['fitness'], private: false },
    { id: 'mood', name: 'Mood (self-report)', unit: 'of five', decimals: 0, resolution: 0.5, zones: ['brain'], risks: [], private: true },
  ],
  zones: [
    { id: 'heart', name: 'Heart and blood vessels', anchor: [0.1, 0.9, 0.1] },
    { id: 'bones', name: 'Bones', anchor: [0.2, -1.2, 0] },
    { id: 'eyes', name: 'Eyes', anchor: [0, 1.5, 0.2] },
  ],
  environments: [
    { id: 'mars-transit', name: 'Mars transit', fact_ids: [] },
    { id: 'mars-surface', name: 'Mars surface', fact_ids: [] },
  ],
  mission: {
    name: 'Fictional mission',
    note: '',
    total_days: 1095,
    basis_fact_ids: [],
    phases: [
      { id: 'earth', name: 'Earth', start: -7, end: 0, environment: null, basis_fact_ids: [] },
      { id: 'transit-out', name: 'Transit', start: 1, end: 182, environment: 'mars-transit', basis_fact_ids: [] },
      { id: 'mars-surface', name: 'Mars surface', start: 183, end: 912, environment: 'mars-surface', basis_fact_ids: [] },
    ],
  },
  features: [],
  slots: [],
  hazard_links: {
    risks: { bone: ['gravity'], sleep: [] },
    studies: { 'zero-t2': ['gravity'], 'space-gardening': ['isolation'] },
    indicators: { heart_rate: ['gravity'], mood: ['radiation', 'isolation', 'distance'] },
    zones: { heart: ['gravity'], bones: ['gravity'], eyes: [] },
    environments: { 'mars-transit': ['radiation', 'isolation', 'distance'], 'mars-surface': ['distance', 'gravity'] },
  },
  pending: [],
  coverage: { total: 2, monitored: 0, partial: 1, pending: 1, rows: [] },
} as unknown as Bundle;
