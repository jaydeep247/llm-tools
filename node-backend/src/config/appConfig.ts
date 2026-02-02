/**
 * Application config from environment.
 * Single place to read env vars so the rest of the app can use typed config.
 */

const parseHours = (value: string | undefined, defaultHours: number): number => {
    if (value === undefined || value === '') return defaultHours;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : defaultHours;
};

/** Crawl completion timeout in hours. Sessions running longer are marked cancelled (timed out). Default 12. */
export const CRAWL_COMPLETION_TIMEOUT_HOURS = parseHours(
    process.env.CRAWL_COMPLETION_TIMEOUT_HOURS,
    12
);

/** Crawl completion timeout in milliseconds (for comparisons). */
export const CRAWL_COMPLETION_TIMEOUT_MS = CRAWL_COMPLETION_TIMEOUT_HOURS * 60 * 60 * 1000;
