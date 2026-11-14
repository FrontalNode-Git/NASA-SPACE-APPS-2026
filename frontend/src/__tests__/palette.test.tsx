import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette } from '../components/CommandPalette';
import { buildPaletteItems, filterPalette, parseVoice } from '../lib/commands';
import { STRINGS, translate } from '../lib/strings';
import { useApp } from '../lib/store';
import { bundle } from './fixture';

afterEach(cleanup);
const t = (key: string) => translate(key);
const items = buildPaletteItems(bundle, t);

describe('command palette', () => {
  it('lists screens and actions before anything is typed', () => {
    const start = filterPalette(items, '');
    expect(start.length).toBeGreaterThan(0);
    expect(start.every((i) => i.group === 'screen' || i.group === 'action')).toBe(true);
  });

  it('searches vitals, body zones, screens and actions', () => {
    expect(filterPalette(items, 'heart').map((i) => i.id)).toEqual(['zone:heart', 'indicator:heart_rate']);
    expect(filterPalette(items, 'resting')[0]?.id).toBe('indicator:heart_rate');
    expect(filterPalette(items, 'bone')[0]?.command).toEqual({ type: 'zone', zone: 'bones' });
    expect(filterPalette(items, 'risk of')).toEqual([]); // the risk catalogue is not part of the crew tool
    expect(filterPalette(items, 'zero')).toEqual([]); // studies are not part of the crew tool
    expect(filterPalette(items, 'crew')[0]?.command).toEqual({ type: 'open', route: '/crew' });
    expect(filterPalette(items, 'night')[0]?.command).toEqual({ type: 'toggle_night' });
    expect(filterPalette(items, 'gravity')[0]?.command).toEqual({ type: 'lens', hazard: 'gravity' });
  });

  it('needs every word to match and returns nothing otherwise', () => {
    expect(filterPalette(items, 'medical officer').map((i) => i.id)).toEqual(['crew:cmo', 'screen:/crew']);
    expect(filterPalette(items, 'zzzz')).toEqual([]);
  });

  it('runs the highlighted command on Enter and closes', () => {
    const run = vi.fn();
    useApp.setState({ bundle, paletteOpen: true, run });
    render(<CommandPalette />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'crew' } });
    expect(screen.getAllByRole('option')[0]?.textContent).toContain('Crew');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(run).toHaveBeenCalledWith({ type: 'open', route: '/crew' });
    expect(useApp.getState().paletteOpen).toBe(false);
  });

  it('moves the selection with the arrow keys', () => {
    useApp.setState({ bundle, paletteOpen: true, run: vi.fn() });
    render(<CommandPalette />);
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1]?.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getAllByRole('option')[0]?.getAttribute('aria-selected')).toBe('true');
  });
});

describe('voice phrases', () => {
  it('understands the four documented phrases', () => {
    expect(parseVoice('log mood 3', bundle)).toEqual({ type: 'log_mood', value: 3 });
    expect(parseVoice("I'm OK", bundle)).toEqual({ type: 'ok' });
    expect(parseVoice('show radiation', bundle)).toEqual({ type: 'lens', hazard: 'radiation' });
    expect(parseVoice('open crew', bundle)).toEqual({ type: 'open', route: '/crew' });
  });

  it('handles spoken numbers and rejects nonsense', () => {
    expect(parseVoice('Log mood four.', bundle)).toEqual({ type: 'log_mood', value: 4 });
    expect(parseVoice('mood 9', bundle)).toBeNull();
    expect(parseVoice('make me a sandwich', bundle)).toBeNull();
    expect(parseVoice('', bundle)).toBeNull();
  });
});

describe('ui strings', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name !== '__tests__') walk(full);
      } else if (/\.tsx?$/.test(name)) files.push(full);
    }
  };
  walk(path.resolve(__dirname, '..'));
  const source = files.map((f) => readFileSync(f, 'utf8')).join('\n');

  it('every literal key used in the code exists in the string table', () => {
    const used = new Set<string>();
    for (const m of source.matchAll(/\bt[r]?\('([a-z][\w-]*(?:\.[\w-]+)+)'/g)) used.add(m[1] as string);
    for (const m of source.matchAll(/key: '([a-z]+\.[\w.-]+)'/g)) used.add(m[1] as string);
    const missing = [...used].filter((k) => !(k in STRINGS));
    expect(missing).toEqual([]);
    expect(used.size).toBeGreaterThan(100);
  });

  it('fills parameters and falls back to the key', () => {
    expect(translate('common.day', { n: 20 })).toBe('Mission day 20');
    expect(translate('common.day')).toBe('Mission day {n}');
    expect(translate('no.such.key')).toBe('no.such.key');
  });
});
