# Tasks: turning a real bug into a fair, checkable task

This folder shows a method used for coding exercises, hiring tests and AI-agent evaluations:
take a **real, hard bug**, describe it as a task, and grade answers with tests that accept
**any correct solution** and reject **hard-coded** ones. Task 001 is a bug found in this app
on 2026-11-26, after the 1.0 release.

```
tasks/
├── grade.sh                     ← tests the tests (run by CI: "Task grader")
└── 001-dst-gap/
    ├── ISSUE.md                 ← what the solver gets: symptom, background, acceptance criteria
    ├── hidden/
    │   ├── oracle.ts            ← the right answer, computed independently (Intl only)
    │   └── localTime.hidden.test.ts ← the grading tests
    └── candidates/
        ├── buggy.ts             ← the code as it was reported      → must FAIL
        ├── hardcoded.ts         ← a "fix" for the reported cities   → must FAIL
        ├── reference.ts         ← our fix                           → must PASS
        └── alternative.ts       ← a correct fix, written differently → must PASS
```

## 1. Find a real bug, and how big it really is
The bug came from asking a question, not from a user: *"what does `parseLocalTime` do on the
days clocks change?"* A ten-line probe compared it with an independent answer and found two
zones wrong. Generating every clock change in the database then showed the real size: **626
wrong local times** in two families:
- **Clocks jump forward:** missing times moved *backward*. At midnight that is the previous day,
  so the 7-day list shows the same day twice in Santiago, Havana and the Azores (6 dates in
  2026–2027).
- **Clocks go back:** a repeated hour always resolved to its *second* occurrence, so both copies
  became the same instant.

A bug report shows one symptom. Before writing a task, measure the whole bug.

## 2. Write the task: the symptom, not the solution
[`ISSUE.md`](001-dst-gap/ISSUE.md) says what users see, how to reproduce it and what "done"
means. It never names the faulty line. What it **does** pin down is behaviour the symptom
leaves open, here what a repeated or missing time should be. Without that, two correct fixes
could disagree and no test could accept both. **An ambiguous spec makes a fair test
impossible.**

## 3. Test against an oracle, not against our fix
The hidden tests never compare with `reference.ts`. They compare with
[`oracle.ts`](001-dst-gap/hidden/oracle.ts), which computes the answer in a different way: it
reads offsets from `Intl`'s `"GMT+05:30"` text and applies the spec's rules. Any implementation
that meets the spec passes, whatever its method. `alternative.ts` proves it: it checks
candidate instants by formatting them back to a clock, a different algorithm from the
reference, and it passes too.

## 4. Make hard-coding fail
A solver who only sees the report can "fix" Santiago and Havana with an `if`. The tests reject
that in three ways:
| Technique | Here |
|---|---|
| **Generate the cases** from the data, not from the report | every offset change in all 418 zones, 2026–2027, and the minutes before, inside and after each one |
| **Test the property**, not the examples | "shown on a clock in the zone, it reads the same"; "a daily date stays on its day" |
| **Random sample** with the seed printed | 3,000 ordinary times; `TASK_SEED=<n>` replays a failure |

`hardcoded.ts` still fails 622 cases, 4 of them wrong days. It also shows why hard-coding is
dangerous, not just incomplete: it **broke** Santiago's other change day (5 April became 4 April 23:00), which the
original code got right.

## 5. Test the tests
`grade.sh` runs the hidden tests against all four candidates and fails if any result is wrong.
A grading test that has never failed proves nothing, and one that has never passed a different
correct solution may only be testing *our* solution.

```bash
tasks/grade.sh
# ok      buggy: hidden tests fail, as they must
# ok      hardcoded: hidden tests fail, as they must
# ok      reference: hidden tests pass, as they must
# ok      alternative: hidden tests pass, as they must
```

## In a real evaluation
Here everything is in the open, because this is a tutorial. For real use:
- keep `hidden/` and `candidates/` **outside** the repository the solver works in, and copy them
  in only when grading;
- give the solver `ISSUE.md`, the repository at the buggy commit, and the normal tests;
- grade with the hidden tests, then also run the project's own checks, so a fix that passes the
  task but breaks something else still fails.

## Add a task
1. Find a real bug and measure its full size with a probe against an independent answer.
2. Write `ISSUE.md`: symptom, reproduction, background, a complete specification, constraints.
3. Write the oracle, then generated property tests and a seeded random sample.
4. Write at least four candidates: the bug, a hard-coded fix, and two different correct fixes.
5. Add them to `grade.sh` and make CI green.
