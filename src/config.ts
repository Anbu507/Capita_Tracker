/** Where the shop's page noticeboard (worker/) runs. Override with VITE_SHARE_API for local testing. */
export const SHARE_API: string = (import.meta.env.VITE_SHARE_API as string | undefined) || 'https://capital-tracker-api.stopwatch-worker.workers.dev';
