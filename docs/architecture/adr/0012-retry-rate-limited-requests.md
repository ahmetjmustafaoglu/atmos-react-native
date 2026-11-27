# ADR-0012: Retry rate-limited requests (HTTP 429), honouring Retry-After

- **Status:** Accepted
- **Date:** 2026-11-27
- **Decided by:** the project owner

## Context
The API contract said "no retry for HTTP 4xx": a 4xx means our request is wrong. HTTP 429 "Too
Many Requests" is the exception: the request is right, the server asks us to **wait and try
again**. Open-Meteo's free tier limits requests per IP address, and in CI (shared machines) the
end-to-end tests met 429s several times; real users behind shared networks (a campus, a mobile
carrier's NAT) can meet them too. The app then showed an error the user could fix only by tapping
"Try again" a moment later.

## Decision
- HTTP 429 is retried like HTTP 5xx: at most 2 more attempts.
- If the answer has `Retry-After` in seconds and it is **at most 10 s**, wait exactly that long.
  Longer: do not retry; show the error at once ("try again later") instead of a long spinner.
- Without `Retry-After` (or with an HTTP date, which we do not parse), use the normal back-off:
  1 s, then 2 s.
- Every other 4xx, and a cancelled request, is still never retried.
- Where: `withRetry` and `retryDelayMs` in `src/data/remote/httpClient.ts` (React Native). The same rule is in the Android, iOS, React Native and Flutter
  apps.

## Alternatives considered
| Option | Why not |
|---|---|
| Keep not retrying 429 | The user does the retry by hand, a few seconds later; we can do it for them. |
| Always wait `Retry-After`, however long | A minute-long spinner is worse than an honest "try later". |
| Parse HTTP-date `Retry-After` too | Open-Meteo sends seconds; a date needs a clock we trust. The back-off covers it. |

## Consequences
- ✅ Short rate limits are invisible to the user.
- ⚠️ A rate-limited request can now take about 20 s more before the error shows (two waits of
  at most 10 s; a 429 answer itself comes back quickly). The loading state already covers it;
  the existing timeouts and network retries are unchanged.
