export const MINUS = '−';

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Number of decimals written in a numeric string ("12.50" → 2). */
export function decimalsOf(raw: string | undefined): number {
  const m = raw?.trim().match(/\.(\d+)(?:e|$)/i);
  return m ? m[1].length : 0;
}

/** Brand rule: true minus sign, optional explicit plus for signed series, fixed decimals. */
export function formatNumber(value: number, decimals = 0, signed = false): string {
  const rounded = Number(value.toFixed(decimals));
  const body = Math.abs(rounded).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (rounded < 0) return MINUS + body;
  return signed && rounded > 0 ? `+${body}` : body;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-09-26" → "26 September 2026" (dates are calendar dates; no timezone shifts). */
export function formatDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  return m[3] ? `${Number(m[3])} ${month} ${m[1]}` : `${month} ${m[1]}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
