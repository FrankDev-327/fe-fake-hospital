import i18n, { t } from '@/i18n';
import type { Bucket } from './api';

/**
 * Chart colors: categorical slots in fixed order (checked with the dataviz validator:
 * colorblind-safe pairs). Slots 2-3 are under 3:1 contrast on white, so every chart has a
 * table view and a legend/labels. Status colors (red/green) are never used for series.
 */
export const SERIES = ['#257de0', '#f47230', '#00b894'] as const;

export const GRID = '#e2e8f0';
export const AXIS = '#64748b';

export const formatNumber = (n: number) =>
  n.toLocaleString(i18n.language === 'hr' ? 'hr-HR' : 'en-GB');

const locale = () => (i18n.language === 'hr' ? 'hr-HR' : 'en-GB');

/** X axis label of a bucket: "12 Mar", "w. 12 Mar", "Mar 2026" */
export function bucketLabel(day: string, bucket: Bucket) {
  const d = new Date(`${day}T12:00:00Z`);
  if (bucket === 'month')
    return d.toLocaleDateString(locale(), {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  const text = d.toLocaleDateString(locale(), {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  return bucket === 'week' ? t('reports.weekOf', { day: text }) : text;
}
