// Whole-day calendar dates for to-dos. Pure (no DOM): a lightweight natural-ish
// date parser plus the few formatters the card chip, row badge, and Future
// agenda share. No dependency — the parser covers exactly the phrasings the UI
// invites (see the table in parseDate). Dates are local-midnight throughout;
// toISODate/fromISODate stay in local time so a date never drifts a day via UTC.

const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WD_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// --- arithmetic (all local midnight) -----------------------------------------

export const atMidnight = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const addMonths = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
export const startOfMonth = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), 1);
export const endOfMonth = (d: Date): Date => new Date(d.getFullYear(), d.getMonth() + 1, 0);
export const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const sameMonth = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

// --- ISO (local, not UTC) ----------------------------------------------------

const pad = (n: number): string => String(n).padStart(2, "0");
export const toISODate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromISODate = (s: string): Date => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

// --- formatting --------------------------------------------------------------

export const formatChip = (d: Date): string => `${WD_SHORT[d.getDay()]}, ${d.getDate()} ${MON_SHORT[d.getMonth()]}`; // "Wed, 8 Jul"
export const formatBadge = (d: Date): string => `${d.getDate()} ${MON_SHORT[d.getMonth()]}`; // "8 Jul"
export const formatDayHeader = (d: Date): { num: string; weekday: string } => ({
  num: String(d.getDate()),
  weekday: WD_LONG[d.getDay()],
});
export const formatMonthHeader = (d: Date, today: Date): string =>
  d.getFullYear() === today.getFullYear() ? MON_LONG[d.getMonth()] : `${MON_LONG[d.getMonth()]} ${d.getFullYear()}`;

// Countdown label for a deadline relative to today. `overdue` is true once the
// deadline is strictly in the past (drives the red cue).
export function deadlineLabel(deadline: Date, today: Date): { text: string; overdue: boolean } {
  const MS_DAY = 86_400_000;
  const days = Math.round((atMidnight(deadline).getTime() - atMidnight(today).getTime()) / MS_DAY);
  if (days === 0) return { text: "today", overdue: false };
  if (days > 0) return { text: days === 1 ? "1 day left" : `${days} days left`, overdue: false };
  const ago = -days;
  return { text: ago === 1 ? "1 day ago" : `${ago} days ago`, overdue: true };
}

// --- parsing -----------------------------------------------------------------

// Prefix match (≥3 chars) into a name table — so "jul"→July, "tue"→Tuesday, and
// the full names work too. Returns the index or -1.
function prefixIndex(token: string, names: string[]): number {
  if (token.length < 3) return -1;
  return names.findIndex((n) => n.toLowerCase().startsWith(token));
}

/**
 * Parse a typed date. Returns a local-midnight Date, or null if unrecognized.
 * `today` is injectable for deterministic tests.
 *
 *   ""                      → null
 *   today                   → today
 *   tomorrow / tmr / tom    → +1 day
 *   yesterday               → -1 day
 *   mon..sun / next fri     → next strictly-future occurrence of that weekday
 *   in N day(s)/week(s)/month(s)
 *   8 jul / jul 8 / july 8  → that day; rolls to next year if already past
 *   2026-07-08 (ISO)        → that exact date
 *   28 (bare day)           → that day-of-month on/after today (rolls forward)
 */
export function parseDate(input: string, today: Date = new Date()): Date | null {
  const t0 = atMidnight(today);
  const s = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = fromISODate(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (s === "today") return t0;
  if (s === "tomorrow" || s === "tmr" || s === "tom") return addDays(t0, 1);
  if (s === "yesterday") return addDays(t0, -1);

  const rel = s.match(/^in (\d+) (day|days|week|weeks|month|months)$/);
  if (rel) {
    const n = Number(rel[1]);
    if (rel[2].startsWith("day")) return addDays(t0, n);
    if (rel[2].startsWith("week")) return addDays(t0, n * 7);
    return addMonths(t0, n);
  }

  const wd = s.replace(/^next /, "");
  const wdIdx = prefixIndex(wd, WD_LONG);
  if (wdIdx !== -1) {
    let delta = (wdIdx - t0.getDay() + 7) % 7;
    if (delta === 0) delta = 7; // a weekday name means the *next* one, never today
    return addDays(t0, delta);
  }

  // month + day in either order ("8 jul" / "jul 8" / "july 8" / "8 july")
  const parts = s.split(" ");
  if (parts.length === 2) {
    let monIdx = -1;
    let day = NaN;
    for (const p of parts) {
      const mi = prefixIndex(p, MON_LONG);
      if (mi !== -1) monIdx = mi;
      else if (/^\d{1,2}$/.test(p)) day = Number(p);
    }
    if (monIdx !== -1 && day >= 1 && day <= 31) {
      let cand = new Date(t0.getFullYear(), monIdx, day);
      if (cand < t0) cand = new Date(t0.getFullYear() + 1, monIdx, day);
      return cand.getMonth() === monIdx ? cand : null; // reject e.g. "31 feb"
    }
  }

  // bare day-of-month → the next occurrence on/after today (search forward)
  if (/^\d{1,2}$/.test(s)) {
    const day = Number(s);
    if (day < 1 || day > 31) return null;
    for (let i = 0; i < 13; i++) {
      const c = new Date(t0.getFullYear(), t0.getMonth() + i, day);
      if (c.getDate() === day && c >= t0) return c;
    }
  }
  return null;
}

// ponytail: assert-based self-check. Run with `npx tsx src/date.ts --demo`.
export function demo(): void {
  const today = new Date(2026, 5, 20); // Sat 20 Jun 2026
  const iso = (s: string) => {
    const d = parseDate(s, today);
    return d ? toISODate(d) : null;
  };
  const eq = (got: unknown, want: unknown, label: string) => {
    if (got !== want) throw new Error(`${label}: got ${got}, want ${want}`);
  };
  eq(iso(""), null, "empty");
  eq(iso("today"), "2026-06-20", "today");
  eq(iso("tomorrow"), "2026-06-21", "tomorrow");
  eq(iso("yesterday"), "2026-06-19", "yesterday");
  eq(iso("in 4 weeks"), "2026-07-18", "in 4 weeks");
  eq(iso("in 3 days"), "2026-06-23", "in 3 days");
  eq(iso("in 2 months"), "2026-08-20", "in 2 months");
  eq(iso("sat"), "2026-06-27", "sat (today is Sat → next Sat)");
  eq(iso("next fri"), "2026-06-26", "next fri");
  eq(iso("monday"), "2026-06-22", "monday");
  eq(iso("8 jul"), "2026-07-08", "8 jul");
  eq(iso("jul 8"), "2026-07-08", "jul 8");
  eq(iso("july 8"), "2026-07-08", "july 8");
  eq(iso("8 jun"), "2027-06-08", "8 jun (past this year → next year)");
  eq(iso("28"), "2026-06-28", "bare 28 (this month)");
  eq(iso("8"), "2026-07-08", "bare 8 (already past → next month)");
  eq(iso("2026-12-25"), "2026-12-25", "iso");
  eq(iso("garbage"), null, "garbage");
  eq(iso("31 feb"), null, "31 feb rejected");
  eq(formatChip(new Date(2026, 6, 8)), "Wed, 8 Jul", "formatChip");
  eq(formatBadge(new Date(2026, 6, 8)), "8 Jul", "formatBadge");
  // toISODate stays local (no UTC drift) even near midnight in a +tz
  eq(toISODate(new Date(2026, 0, 1)), "2026-01-01", "toISODate local");
  // deadlineLabel countdown
  eq(deadlineLabel(new Date(2026, 5, 20), today).text, "today", "deadline today");
  eq(deadlineLabel(new Date(2026, 5, 20), today).overdue, false, "today not overdue");
  eq(deadlineLabel(new Date(2026, 5, 21), today).text, "1 day left", "deadline +1");
  eq(deadlineLabel(new Date(2026, 5, 25), today).text, "5 days left", "deadline +5");
  eq(deadlineLabel(new Date(2026, 5, 19), today).text, "1 day ago", "deadline -1");
  eq(deadlineLabel(new Date(2026, 5, 19), today).overdue, true, "deadline overdue");
  eq(deadlineLabel(new Date(2026, 5, 10), today).text, "10 days ago", "deadline -10");
  console.log("date.ts demo: all assertions passed ✓");
}

// Run the self-check directly: `npx tsx src/date.ts --demo`
// @ts-expect-error import.meta.main is a Bun/Deno-ism; guarded by typeof
if (typeof process !== "undefined" && process.argv?.includes("--demo")) demo();
