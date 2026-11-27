/**
 * The independent oracle for task 001. It never calls the code under test: it uses only `Intl`
 * (the time zone database of the JavaScript engine) and the rules in ISSUE.md.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const offsetFormats = new Map<string, Intl.DateTimeFormat>();

/** The zone's UTC offset at `instant`, read from Intl's "GMT+05:30" text. */
export function offsetAt(zone: string, instant: number): number {
    let format = offsetFormats.get(zone);
    if (!format) {
        format = new Intl.DateTimeFormat('en-US', {
            timeZone: zone,
            timeZoneName: 'longOffset',
        });
        offsetFormats.set(zone, format);
    }
    const name =
        format.formatToParts(instant).find(part => part.type === 'timeZoneName')
            ?.value ?? '';
    const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
    if (!match) {
        return 0; // "GMT": UTC itself
    }
    const [, sign, hours, minutes] = match;
    return (
        (sign === '-' ? -1 : 1) *
        (Number(hours) * HOUR + Number(minutes) * MINUTE)
    );
}

/** Local wall-clock time as if it were UTC: "2026-09-06T00:30" → its UTC milliseconds. */
export function wallClock(text: string): number {
    const [date = '', time = '00:00'] = text.split('T');
    const [y, m, d] = date.split('-').map(Number);
    const [h, min] = time.split(':').map(Number);
    return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1, h ?? 0, min ?? 0);
}

/** The text a local time has in the API: "2026-09-06T00:30" or, at midnight, "2026-09-06". */
export function localText(wall: number, dateOnly = false): string {
    const iso = new Date(wall).toISOString();
    return dateOnly ? iso.slice(0, 10) : iso.slice(0, 16);
}

/**
 * The expected instant for a local time (ISSUE.md, "compatible" rule):
 * - exactly one instant shows it → that instant;
 * - two do (clocks went back) → the earlier one;
 * - none does (clocks jumped forward) → read it with the offset from before the jump, which
 *   moves it forward by the length of the gap.
 */
export function expectedInstant(zone: string, wall: number): number {
    const before = offsetAt(zone, wall - DAY);
    const after = offsetAt(zone, wall + DAY);
    const valid = [wall - before, wall - after].filter(
        instant => instant + offsetAt(zone, instant) === wall,
    );
    return valid.length > 0 ? Math.min(...valid) : wall - before;
}

/** Every change of `zone`'s offset between `from` and `to` (to the minute). */
export function transitions(
    zone: string,
    from: number,
    to: number,
): { instant: number; before: number; after: number }[] {
    const found: { instant: number; before: number; after: number }[] = [];
    let previous = offsetAt(zone, from);
    for (let t = from + DAY; t <= to; t += DAY) {
        const current = offsetAt(zone, t);
        if (current !== previous) {
            let low = t - DAY;
            let high = t; // offset changes in (low, high]
            while (high - low > MINUTE) {
                const middle =
                    low + Math.floor((high - low) / 2 / MINUTE) * MINUTE;
                if (offsetAt(zone, middle) === previous) {
                    low = middle;
                } else {
                    high = middle;
                }
            }
            found.push({ instant: high, before: previous, after: current });
            previous = current;
        }
    }
    return found;
}
