const eastern = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The US-Eastern calendar date as YYYYMMDD. ESPN groups games by Eastern date. */
export function easternDate(d: Date): string {
  const parts = Object.fromEntries(eastern.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.year}${parts.month}${parts.day}`;
}

/** YYYYMMDD plus n days. */
export function addDays(date: string, n: number): string {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8) + n));
  return d.toISOString().slice(0, 10).replaceAll('-', '');
}
