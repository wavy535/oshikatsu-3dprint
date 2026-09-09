-- Match the predicates and stable orders used by the paged lists.
CREATE INDEX orders_created_page_idx ON orders (created_at DESC, id DESC);
CREATE INDEX orders_buyer_page_idx ON orders (buyer_id, created_at DESC, id DESC);
CREATE INDEX works_creator_page_idx ON works (creator_id, created_at DESC, id DESC);
CREATE INDEX print_jobs_due_page_idx ON print_jobs (due_at, job_no, id);
CREATE INDEX shipments_page_idx ON shipments (shipped_at DESC, id DESC);
CREATE INDEX messages_conversation_page_idx ON messages (sender_id, recipient_id, created_at DESC, id DESC);
CREATE INDEX messages_inbox_page_idx ON messages (recipient_id, created_at DESC, id DESC);
