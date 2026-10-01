CREATE TABLE activity_outbox (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES users(id),
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX activity_outbox_available ON activity_outbox(available_at);
