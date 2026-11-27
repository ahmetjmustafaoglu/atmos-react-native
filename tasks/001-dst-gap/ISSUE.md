# Task 001 — The 7-day forecast shows the same day twice

> This is the task **as a solver receives it**: the symptom, how to see it, what "done" means.
> It does not say where the bug is or how to fix it.

## Reported
> "I'm in Santiago. On Sunday 6 September the 7-day list said *Saturday, Saturday, Monday…*.
> Sunday was missing." — also reported once from Havana, on 8 March.

## Reproduce
In a test, map a forecast whose daily dates include `2026-09-06` for the zone
`America/Santiago`, and format the day names in that zone: the 6th shows as **Saturday**.

## Background you need
Open-Meteo sends local times **without an offset**: `"2026-09-06"` is midnight *in Santiago*,
`"2026-09-06T14:00"` is 2 pm in Santiago. `parseLocalTime` in `src/data` turns them into
instants. On the two days a year a zone changes its clocks:
- when clocks **jump forward**, some local times do not exist (Santiago skips 00:00–00:59);
- when clocks **go back**, some local times happen twice.

## Acceptance criteria (the specification the hidden tests check)
For every zone in the time zone database and every local time:
1. A local time that exists once maps to that instant: shown again on a clock in the zone, it
   reads the same.
2. A local time that exists **twice** maps to the **earlier** instant.
3. A local time that does **not exist** is read with the offset in force **before** the jump,
   which moves it forward by the length of the gap (Santiago's `00:30` becomes `01:30`). So a
   daily date never moves to the previous day.
4. Everything else is unchanged: fixed-offset zones (seconds), the accepted text formats, and
   `undefined` for any other text.

Rules 2 and 3 are the "compatible" rule of JavaScript's `Temporal` and of most date libraries.
They are spelled out because two correct fixes would otherwise disagree, and a fair test needs
one answer.

## Constraints
- No new dependency (AGENTS.md).
- Keep the function's signature; other code calls it.

## Done when
- The hidden tests pass. You do not see them; they cover far more than the reported cities.
- The existing tests still pass: `npm run typecheck && npm run lint && npm test`.
