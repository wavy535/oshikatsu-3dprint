export const DEMO_BROWSER_DAILY_LIMIT = 30;
export const DEMO_GLOBAL_DAILY_LIMIT = 100;
export const DEMO_COOLDOWN_MS = 8000;

export type DemoQuota = {
  remaining: number;
  globalRemaining: number;
  resetAt: number;
};
