/**
 * Local times on the days clocks change, in every zone (the "same day twice" bug, found after
 * 1.0; see tasks/001-dst-gap on the task/dst-midnight-day branch). The expected values come from
 * an independent oracle (`support/timeZoneOracle.ts`, Intl only); the cases are generated from
 * the time zone database, plus a random sample with its seed printed.
 */
import { parseLocalTime } from '../../src/data/mappers/localTime';
import {
    expectedInstant,
    localText,
    transitions,
} from '../support/timeZoneOracle';

const MINUTE = 60_000;
const FROM = Date.UTC(2026, 0, 1);
const TO = Date.UTC(2027, 11, 31);
/**
 * Every zone the engine knows. `Intl.supportedValuesOf` exists in Node 18+ and Hermes, but the
 * project's TypeScript library settings predate it, hence the typed view.
 */
const ZONES: readonly string[] = (
    Intl as unknown as { supportedValuesOf(key: 'timeZone'): string[] }
).supportedValuesOf('timeZone');

/** TASK_SEED from the environment, without depending on Node's type definitions. */
const environment = (
    globalThis as { process?: { env: Record<string, string | undefined> } }
).process?.env;

interface Case {
    readonly zone: string;
    readonly text: string;
}

function check(cases: readonly Case[]): string[] {
    return cases.flatMap(({ zone, text }) => {
        const expected = expectedInstant(
            zone,
            Date.parse(`${text.length === 10 ? `${text}T00:00` : text}:00Z`),
        );
        const actual = parseLocalTime(text, zone);
        return actual === expected
            ? []
            : [
                  `${zone} "${text}": expected ${new Date(
                      expected,
                  ).toISOString()}, got ${
                      actual === undefined
                          ? 'undefined'
                          : new Date(actual).toISOString()
                  }`,
              ];
    });
}

/** Local times around each change: before it, inside the gap or the overlap, after it. */
function casesAroundChanges(): Case[] {
    return ZONES.flatMap(zone =>
        transitions(zone, FROM, TO).flatMap(({ instant, before, after }) => {
            const wallBefore = instant + before; // the wall clock the change starts from
            const size = Math.abs(after - before);
            const walls = [
                wallBefore - 60 * MINUTE,
                wallBefore - MINUTE,
                wallBefore,
                wallBefore + Math.floor(size / 2 / MINUTE) * MINUTE,
                wallBefore + size - MINUTE,
                wallBefore + size,
                wallBefore + size + 60 * MINUTE,
            ];
            const atMidnight = walls.filter(
                wall => wall % (24 * 60 * MINUTE) === 0,
            );
            return [
                ...walls.map(wall => ({ zone, text: localText(wall) })),
                // Daily dates are plain "YYYY-MM-DD": midnight, the case users saw.
                ...atMidnight.map(wall => ({
                    zone,
                    text: localText(wall, true),
                })),
            ];
        }),
    );
}

/**
 * A small, seedable random generator (Park–Miller: state × 48271 mod 2³¹ − 1), so a failure can
 * be replayed with the same seed. Plain arithmetic, no bitwise operators.
 */
function random(seed: number): () => number {
    const modulus = 2_147_483_647;
    let state = (Math.abs(Math.floor(seed)) % (modulus - 1)) + 1;
    return () => {
        state = (state * 48_271) % modulus;
        return (state - 1) / (modulus - 1);
    };
}

describe('parseLocalTime on the days clocks change', () => {
    test('every local time near every offset change, in every zone, 2026–2027', () => {
        const cases = casesAroundChanges();
        expect(cases.length).toBeGreaterThan(1000); // the database really was read
        expect(check(cases)).toEqual([]);
    });

    test('the reported symptom: no day of the 7-day list moves to the previous day', () => {
        const days = casesAroundChanges().filter(c => c.text.length === 10);
        const wrong = days.filter(({ zone, text }) => {
            const instant = parseLocalTime(text, zone);
            const shown = new Intl.DateTimeFormat('en-CA', {
                timeZone: zone,
            }).format(instant);
            return shown !== text;
        });
        expect(wrong.map(c => `${c.zone} ${c.text}`)).toEqual([]);
    });

    test('ordinary times stay correct (random sample, seed printed)', () => {
        const seed = Number(environment?.TASK_SEED ?? Date.now() % 1_000_000);
        const next = random(seed);
        const cases = Array.from({ length: 3000 }, () => {
            const zone = ZONES[Math.floor(next() * ZONES.length)] ?? 'UTC';
            const wall =
                FROM + Math.floor((next() * (TO - FROM)) / MINUTE) * MINUTE;
            return { zone, text: localText(wall) };
        });
        const problems = check(cases);
        if (problems.length > 0) {
            console.log(`Replay with TASK_SEED=${seed}`);
        }
        expect(problems).toEqual([]);
    });

    test('the contract around it is unchanged', () => {
        expect(parseLocalTime('2026-11-11T10:15', 'Europe/Istanbul')).toBe(
            Date.UTC(2026, 10, 11, 7, 15),
        );
        expect(parseLocalTime('2026-11-11T10:15', 10_800)).toBe(
            Date.UTC(2026, 10, 11, 7, 15),
        );
        expect(parseLocalTime('11/11/2026', 'UTC')).toBeUndefined();
        expect(parseLocalTime(undefined, 'UTC')).toBeUndefined();
    });
});
