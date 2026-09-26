/**
 * The game calendar: 365-day years without leap days, as in most grand strategy games. A day is an
 * integer count from 1 January of year 0.
 */
export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_START: number[] = [];
let acc = 0;
for (const d of MONTH_DAYS) {
  MONTH_START.push(acc);
  acc += d;
}
export const YEAR_DAYS = 365;

export interface GameDate {
  y: number;
  m: number;
  d: number;
}

export function toDay(y: number, m: number, d: number): number {
  return y * YEAR_DAYS + MONTH_START[m - 1] + (d - 1);
}

export function toDate(day: number): GameDate {
  const y = Math.floor(day / YEAR_DAYS);
  let rest = day - y * YEAR_DAYS;
  let m = 0;
  while (m < 11 && rest >= MONTH_DAYS[m]) rest -= MONTH_DAYS[m++];
  return { y, m: m + 1, d: rest + 1 };
}

export function parseDate(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return toDay(y, m, d);
}

export const isMonthStart = (day: number) => toDate(day).d === 1;
export const isYearStart = (day: number) => day % YEAR_DAYS === 0;

/** Whole years between two days. */
export function yearsBetween(from: number, to: number): number {
  return Math.floor((to - from) / YEAR_DAYS);
}

export const years = (n: number) => Math.round(n * YEAR_DAYS);
export const months = (n: number) => Math.round((n * YEAR_DAYS) / 12);
