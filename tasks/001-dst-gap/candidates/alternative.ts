/**
 * Open-Meteo sends local times without an offset ("2026-11-11T10:15" means 10:15 *in
 * Istanbul*). These helpers turn them into real instants using the place's IANA time zone.
 * No date library: `Intl.DateTimeFormat` already knows every zone and its daylight saving rules.
 */
const LOCAL_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;

/** Returns the zone, or `undefined` if the JavaScript engine does not know it. */
export function knownTimeZone(name: string | undefined): string | undefined {
    if (!name) {
        return undefined;
    }
    try {
        // Throws a RangeError for a zone the engine does not know.
        return new Intl.DateTimeFormat('en-US', {
            timeZone: name,
        }).resolvedOptions().timeZone
            ? name
            : undefined;
    } catch {
        return undefined;
    }
}

/** How far ahead of UTC `timeZone` is at the instant `epochMs`, in milliseconds. */
export function zoneOffsetMs(timeZone: string, epochMs: number): number {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).formatToParts(new Date(epochMs));
    const part = (type: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find(p => p.type === type)?.value);
    const asUtc = Date.UTC(
        part('year'),
        part('month') - 1,
        part('day'),
        part('hour'),
        part('minute'),
        part('second'),
    );
    return asUtc - Math.floor(epochMs / 1000) * 1000;
}

const HOUR_MS = 60 * 60 * 1000;

const wallFormats = new Map<string, Intl.DateTimeFormat>();

/** How `instant` reads on a clock in `zone`, as "2026-09-06T00:30". */
function wallText(zone: string, instant: number): string {
    let format = wallFormats.get(zone);
    if (!format) {
        format = new Intl.DateTimeFormat('en-CA', {
            timeZone: zone,
            hourCycle: 'h23',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
        wallFormats.set(zone, format);
    }
    return format.format(instant).replace(', ', 'T');
}

/**
 * Reads "2026-11-11T10:15" or "2026-11-11" as a time in `zone` (an IANA name, or a fixed offset
 * in seconds). Returns `undefined` for text in any other format.
 *
 * A different method from the reference fix: try the offsets in effect around that day, the
 * larger first, and keep the first instant whose clock really shows the text. The larger offset
 * gives the earlier instant, so a repeated time resolves to its first occurrence. If no offset
 * works, the time fell into a gap: use the offset from before the jump (Temporal "compatible").
 */
export function parseLocalTime(
    text: string | null | undefined,
    zone: string | number,
): number | undefined {
    const match = text ? LOCAL_TIME.exec(text) : null;
    if (!match) {
        return undefined;
    }
    const [, year, month, day, hour = '0', minute = '0'] = match;
    const wallClock = Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
    );
    if (typeof zone === 'number') {
        return wallClock - zone * 1000;
    }
    const wanted = `${year}-${month}-${day}T${hour.padStart(
        2,
        '0',
    )}:${minute.padStart(2, '0')}`;
    const offsetBefore = zoneOffsetMs(zone, wallClock - 24 * HOUR_MS);
    const offsets = [
        ...new Set([
            offsetBefore,
            zoneOffsetMs(zone, wallClock),
            zoneOffsetMs(zone, wallClock + 24 * HOUR_MS),
        ]),
    ];
    offsets.sort((a, b) => b - a);
    const exact = offsets
        .map(offset => wallClock - offset)
        .find(instant => wallText(zone, instant) === wanted);
    return exact ?? wallClock - offsetBefore;
}
