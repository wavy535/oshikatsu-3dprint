-- Internal quota reservations. No prompts, designs or provider responses are stored.
CREATE TABLE ai_design_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX ai_design_usage_time ON ai_design_usage(created_at);
CREATE INDEX ai_design_usage_user_time ON ai_design_usage(user_id, created_at);
