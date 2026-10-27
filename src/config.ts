/** Where the shop's page noticeboard (worker/) runs. Override with VITE_SHARE_API for local testing. */
export const SHARE_API: string = (import.meta.env.VITE_SHARE_API as string | undefined) || 'https://capital-tracker-api.stopwatch-worker.workers.dev';

/** Gives up on a request after `ms`, so a stuck connection never leaves the app waiting forever. */
export async function fetchWithin(url: string, init: RequestInit = {}, ms = 10_000): Promise<Response> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: stop.signal });
  } finally {
    clearTimeout(timer);
  }
}
