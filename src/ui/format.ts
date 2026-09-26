const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function roman(n: number): string {
  const table: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let s = '';
  for (const [v, r] of table)
    while (n >= v) {
      s += r;
      n -= v;
    }
  return s;
}

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
}

export function formatDate(d: { y: number; m: number; d: number }): string {
  return `${ordinal(d.d)} of ${MONTHS[d.m - 1]}, ${d.y} AD`;
}

/** Upper-cases the first letter, for names like "the Seljuks" that open a line. */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export const GOVERNMENT_NAMES: Record<string, string> = {
  feudal: 'Feudal Monarchy',
  imperial: 'Imperial Administration',
  clan: 'Dynastic Emirate',
  tribal: 'Tribal Chiefdom',
  nomadic: 'Nomadic Horde',
  republic: 'Merchant Republic',
  theocracy: 'Theocracy',
  absolute: 'Absolute Monarchy',
  constitutional: 'Constitutional Monarchy',
  democracy: 'Democracy',
  dictatorship: 'Dictatorship',
  communist: 'Communist State',
};

export const RANK_NAMES: Record<string, string> = {
  county: 'County',
  duchy: 'Duchy',
  kingdom: 'Kingdom',
  empire: 'Empire',
};
