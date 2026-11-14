import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { STATUS_META, StatusBadge, StatusGlyph } from '../components/StatusGlyph';
import type { Status } from '../lib/types';

afterEach(cleanup);

describe('status glyph', () => {
  const cases: [Status, string, string][] = [
    ['nominal', 'circle', 'circle'],
    ['watch', 'triangle', 'path'],
    ['call_ground', 'square', 'rect'],
  ];

  it.each(cases)('%s renders a %s', (status, shape, element) => {
    const { container } = render(<StatusGlyph status={status} title={status} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('data-shape')).toBe(shape);
    expect(svg?.querySelectorAll(element)).toHaveLength(1);
    expect(svg?.children).toHaveLength(1);
    expect(svg?.getAttribute('aria-label')).toBe(status);
  });

  it('gives every status a different shape and colour class', () => {
    const metas = Object.values(STATUS_META);
    expect(new Set(metas.map((m) => m.shape)).size).toBe(3);
    expect(new Set(metas.map((m) => m.text)).size).toBe(3);
  });

  it('badge carries shape, colour and text together', () => {
    const { container } = render(<StatusBadge status="watch" />);
    expect(screen.getByText('Watch')).toBeTruthy();
    expect(container.querySelector('[data-status="watch"] svg[data-shape="triangle"]')).toBeTruthy();
  });
});
