-- Anonymous demo reservations are separate from member quotas. No prompts or IPs.
CREATE TABLE ai_demo_usage (
  id TEXT PRIMARY KEY,
  browser_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX ai_demo_usage_time ON ai_demo_usage(created_at);
CREATE INDEX ai_demo_usage_browser_time ON ai_demo_usage(browser_id, created_at);
