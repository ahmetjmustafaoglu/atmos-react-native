/** What the data layer needs from an HTTP answer. */
export interface HttpResponse {
    readonly status: number;
    readonly body: string;
    /** The `Retry-After` header, if the server sent one (with 429 "Too Many Requests"). */
    readonly retryAfter?: string;
}

/** The smallest thing the data layer needs from the network: GET a URL, get text and a status. */
export interface HttpClient {
    get(url: string, signal?: AbortSignal): Promise<HttpResponse>;
}

/** Raised for a request that took longer than the contract allows. */
export class TimeoutError extends Error {
    override readonly name = 'TimeoutError';
}

/** Raised when the caller cancelled the request (the screen went away). */
export class CancelledError extends Error {
    override readonly name = 'CancelledError';
}

/** Raised for a non-2xx answer. */
export class HttpStatusError extends Error {
    override readonly name = 'HttpStatusError';
    constructor(readonly status: number) {
        super(`HTTP ${status}`);
    }
}

/**
 * The real client, on `fetch`, with the rules from API_CONTRACT §4: a 15-second timeout and a
 * User-Agent without personal data. A caller's `signal` cancels the request.
 */
export function createFetchHttpClient(
    userAgent: string,
    timeoutMs = 15_000,
): HttpClient {
    return {
        async get(url, signal) {
            const controller = new AbortController();
            let timedOut = false;
            const timer = setTimeout(() => {
                timedOut = true;
                controller.abort();
            }, timeoutMs);
            const onCallerAbort = () => controller.abort();
            signal?.addEventListener('abort', onCallerAbort);
            try {
                const response = await fetch(url, {
                    headers: { 'User-Agent': userAgent },
                    signal: controller.signal,
                });
                const retryAfter = response.headers.get('Retry-After');
                return {
                    status: response.status,
                    body: await response.text(),
                    ...(retryAfter !== null ? { retryAfter } : {}),
                };
            } catch (error) {
                if (timedOut) {
                    throw new TimeoutError(url);
                }
                if (signal?.aborted) {
                    throw new CancelledError(url);
                }
                throw error; // a network failure: fetch throws TypeError
            } finally {
                clearTimeout(timer);
                signal?.removeEventListener('abort', onCallerAbort);
            }
        },
    };
}

/** The longest `Retry-After` the app waits for: longer, and the user hears "try later" now. */
export const MAX_RETRY_AFTER_MS = 10_000;

/**
 * How long to wait before retrying `response`, or `undefined` when it must not be retried
 * (API_CONTRACT §4, ADR-0012):
 * - HTTP 5xx: back-off (`backOffMs`);
 * - HTTP 429 "Too Many Requests": the server's `Retry-After` in seconds, if it sent one and it is
 *   at most 10 s; longer is not retried; without the header (or as a date), the back-off;
 * - any other answer: not retried. Another 4xx means our request is wrong.
 */
export function retryDelayMs(
    response: HttpResponse,
    backOffMs: number,
): number | undefined {
    if (response.status >= 500) {
        return backOffMs;
    }
    if (response.status !== 429) {
        return undefined;
    }
    const seconds = response.retryAfter?.trim();
    if (!seconds || !/^\d+$/.test(seconds)) {
        return backOffMs;
    }
    const ms = Number(seconds) * 1000;
    return ms <= MAX_RETRY_AFTER_MS ? ms : undefined;
}

/**
 * Retries network errors, HTTP 5xx and HTTP 429 with exponential back-off (`baseDelayMs`, then
 * twice that), or the server's `Retry-After` for 429 (see {@link retryDelayMs}). Other 4xx are
 * **not** retried, and neither is a cancellation.
 */
export function withRetry(
    client: HttpClient,
    options: {
        maxRetries?: number;
        baseDelayMs?: number;
        sleep?: (ms: number) => Promise<void>;
    } = {},
): HttpClient {
    const {
        maxRetries = 2,
        baseDelayMs = 1000,
        sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    } = options;
    return {
        async get(url, signal) {
            for (let attempt = 0; ; attempt += 1) {
                const backOff = baseDelayMs * 2 ** attempt;
                let wait: number | undefined;
                try {
                    const response = await client.get(url, signal);
                    wait = retryDelayMs(response, backOff);
                    if (wait === undefined || attempt >= maxRetries) {
                        return response;
                    }
                } catch (error) {
                    const retryable = !(error instanceof CancelledError);
                    if (!retryable || attempt >= maxRetries) {
                        throw error;
                    }
                    wait = backOff;
                }
                await sleep(wait);
            }
        },
    };
}
