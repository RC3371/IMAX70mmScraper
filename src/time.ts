const PT = "America/Los_Angeles";

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: PT,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hour12: false,
});

export interface PtParts {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  hour: number;
  minute: number;
  weekday: string; // "Mon".."Sun"
}

export function toPT(d: Date): PtParts {
  const p: Record<string, string> = {};
  for (const { type, value } of partsFmt.formatToParts(d)) p[type] = value;
  const hour = p.hour === "24" ? "00" : p.hour;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${hour}:${p.minute}`,
    hour: Number(hour),
    minute: Number(p.minute),
    weekday: p.weekday,
  };
}

// Hot window: 00:00–09:00 PT any day, or all day Thu/Fri (film-week boundary).
export function inHotWindow(d: Date): boolean {
  const pt = toPT(d);
  return pt.hour < 9 || pt.weekday === "Thu" || pt.weekday === "Fri";
}

export function inBlitz(d: Date, start?: string, end?: string): boolean {
  if (!start || !end) return false;
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (Number.isNaN(s) || Number.isNaN(e)) return false;
  return d.getTime() >= s && d.getTime() <= e;
}

// Should this cron tick actually fetch? 2-min cron; baseline every 15 min,
// 2-min rate inside hot window, every tick during a blitz.
export function shouldRun(d: Date, blitzStart?: string, blitzEnd?: string): boolean {
  if (inBlitz(d, blitzStart, blitzEnd)) return true;
  const pt = toPT(d);
  return inHotWindow(d) || pt.minute % 15 === 0;
}

export function jitterMs(maxMs = 15000): number {
  return Math.floor(Math.random() * maxMs);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Day of week (0=Sun … 6=Sat) for a PT calendar-date string "YYYY-MM-DD".
// The date is already theater-local, so read it at UTC midnight — tz-safe.
export function dayOfWeek(localDate: string): number {
  return new Date(`${localDate}T00:00:00Z`).getUTCDay();
}
export const FRIDAY = 5;

// List of YYYY-MM-DD dates starting at `from` (inclusive), n days.
export function dateRange(from: string, n: number): string[] {
  const [y, m, d] = from.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    out.push(dt.toISOString().slice(0, 10));
  }
  return out;
}
