import {
    knownTimeZone,
    parseLocalTime,
} from '../../src/data/mappers/localTime';

describe('parseLocalTime', () => {
    test('reads a local time in the place time zone: 10:15 in Istanbul is 07:15 UTC', () => {
        expect(parseLocalTime('2026-11-11T10:15', 'Europe/Istanbul')).toBe(
            Date.UTC(2026, 10, 11, 7, 15),
        );
    });

    test('follows daylight saving time: New York is UTC-4 in July and UTC-5 in January', () => {
        expect(parseLocalTime('2026-07-01T12:00', 'America/New_York')).toBe(
            Date.UTC(2026, 6, 1, 16, 0),
        );
        expect(parseLocalTime('2026-01-15T12:00', 'America/New_York')).toBe(
            Date.UTC(2026, 0, 15, 17, 0),
        );
    });

    test('a daily date never moves to the previous day where clocks jump at midnight', () => {
        // Santiago skips 00:00–00:59 on 6 Sept 2026: the day starts at 01:00 (the reported bug).
        expect(parseLocalTime('2026-09-06', 'America/Santiago')).toBe(
            Date.UTC(2026, 8, 6, 4, 0),
        );
    });

    test('a repeated time is its first occurrence; a missing one moves past the gap', () => {
        // Ceuta, 25 Oct 2026: 02:00–02:59 happens twice (+2, then +1). The first is 00:00 UTC.
        expect(parseLocalTime('2026-10-25T02:00', 'Africa/Ceuta')).toBe(
            Date.UTC(2026, 9, 25, 0, 0),
        );
        // New York, 8 Mar 2026: 02:30 does not exist; it reads as 03:30 EDT (07:30 UTC).
        expect(parseLocalTime('2026-03-08T02:30', 'America/New_York')).toBe(
            Date.UTC(2026, 2, 8, 7, 30),
        );
    });

    test('a date without a time is the start of that day at the place', () => {
        expect(parseLocalTime('2026-11-11', 'Europe/Istanbul')).toBe(
            Date.UTC(2026, 10, 10, 21, 0),
        );
    });

    test('a fixed offset in seconds is the fallback zone', () => {
        expect(parseLocalTime('2026-11-11T10:15', 10_800)).toBe(
            Date.UTC(2026, 10, 11, 7, 15),
        );
    });

    test.each([
        undefined,
        null,
        '',
        '11/11/2026 10:15',
        '2026-11-11T10:15:00Z',
    ])('given text in another format (%p), then returns undefined', text => {
        expect(parseLocalTime(text, 'UTC')).toBeUndefined();
    });
});

describe('knownTimeZone', () => {
    test('keeps a zone the engine knows and refuses one it does not', () => {
        expect(knownTimeZone('Europe/Istanbul')).toBe('Europe/Istanbul');
        expect(knownTimeZone('Mars/Olympus_Mons')).toBeUndefined();
        expect(knownTimeZone(undefined)).toBeUndefined();
    });
});
