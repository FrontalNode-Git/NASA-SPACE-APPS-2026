import { LineChart } from 'echarts/charts';
import { GridComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import { useEffect, useRef, useState } from 'react';
import { useApp, useT } from '../lib/store';

echarts.use([LineChart, GridComponent, TooltipComponent, MarkAreaComponent, MarkLineComponent, CanvasRenderer]);

export interface ThemeColors {
  text: string;
  muted: string;
  line: string;
  panel: string;
  accent: string;
  nominal: string;
  watch: string;
  call: string;
}

/** Chart colours come from the same CSS variables as the rest of the UI, so night mode follows. */
export function readTheme(): ThemeColors {
  const css = getComputedStyle(document.documentElement);
  const rgb = (name: string) => `rgb(${css.getPropertyValue(`--${name}`).trim().replace(/\s+/g, ', ') || '128, 128, 128'})`;
  return {
    text: rgb('text'),
    muted: rgb('muted'),
    line: rgb('border'),
    panel: rgb('panel'),
    accent: rgb('accent'),
    nominal: rgb('nominal'),
    watch: rgb('watch'),
    call: rgb('call'),
  };
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export interface ChartTable {
  columns: string[];
  rows: (string | number)[][];
}

interface Props {
  option: (theme: ThemeColors) => EChartsCoreOption;
  table: ChartTable;
  label: string;
  height?: number;
  deps: unknown[];
}

/** Every chart can be read as a table instead ("Show as table"). */
export function Chart({ option, table, label, height = 150, deps }: Props) {
  const t = useT();
  const night = useApp((s) => s.night);
  const [asTable, setAsTable] = useState(false);
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (asTable || !el.current) return;
    const instance = echarts.init(el.current);
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(el.current);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, [asTable]);

  useEffect(() => {
    if (asTable || !chart.current) return;
    chart.current.setOption({ animation: !prefersReducedMotion(), ...option(readTheme()) }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asTable, night, ...deps]);

  return (
    <div>
      {asTable ? (
        <div key="table" className="relative max-h-56 overflow-auto rounded border border-line">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">{label}</caption>
            <thead className="sticky top-0 bg-panel text-muted">
              <tr>
                {table.columns.map((c) => (
                  <th key={c} scope="col" className="px-2 py-1 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i} className="border-t border-line/60">
                  {row.map((cell, j) => (
                    <td key={j} className="px-2 py-1 tabular-nums">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div key="chart" ref={el} style={{ height }} role="img" aria-label={label} />
      )}
      <button
        type="button"
        onClick={() => setAsTable(!asTable)}
        className="mt-1 text-xs text-muted underline underline-offset-2 hover:text-ink"
        aria-pressed={asTable}
      >
        {asTable ? t('chart.showChart') : t('chart.showTable')}
      </button>
    </div>
  );
}
