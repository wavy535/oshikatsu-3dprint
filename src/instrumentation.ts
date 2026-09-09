export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.BACKGROUND_JOBS_ENABLED === "true"
  ) {
    const { startBackgroundJobs } = await import("./lib/jobs/worker");
    startBackgroundJobs();
  }
}
