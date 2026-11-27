#!/usr/bin/env bash
# Tests the tests: runs task 001's hidden tests against four versions of the code and checks
# that each gets the result it must. A good task test accepts every correct solution and rejects
# everything else, so it is checked from both sides:
#
#   buggy        the code as reported            → the hidden tests must FAIL
#   hardcoded    a "fix" for the reported cities → must FAIL
#   reference    the fix we wrote                → must PASS
#   alternative  a correct fix, written another way → must PASS
#
# usage: tasks/grade.sh            (TASK_SEED=<n> replays a random sample)
set -euo pipefail

TARGET=src/data/mappers/localTime.ts
TASK=tasks/001-dst-gap
BACKUP=$(mktemp)
cp "$TARGET" "$BACKUP"
trap 'cp "$BACKUP" "$TARGET"; rm -f "$BACKUP"' EXIT

failures=0
for entry in buggy:fail hardcoded:fail reference:pass alternative:pass; do
    candidate=${entry%%:*}
    expected=${entry##*:}
    cp "$TASK/candidates/$candidate.ts" "$TARGET"
    if npx jest --rootDir . "$TASK/hidden" --testPathIgnorePatterns /node_modules/ \
        > "build-grade-$candidate.log" 2>&1; then
        actual=pass
    else
        actual=fail
    fi
    if [ "$actual" = "$expected" ]; then
        echo "ok      $candidate: hidden tests $actual, as they must"
    else
        echo "error: $candidate: the hidden tests should $expected but they ${actual}ed"
        tail -25 "build-grade-$candidate.log"
        failures=$((failures + 1))
    fi
done
rm -f build-grade-*.log
exit "$failures"
