CREATE TABLE users (
  id uuid PRIMARY KEY, name varchar(80) NOT NULL, email varchar(254) UNIQUE NOT NULL, password_hash text NOT NULL
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at bigint NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE projects (
  id uuid PRIMARY KEY, name varchar(80) NOT NULL, description varchar(500) NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE tickets (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title varchar(160) NOT NULL, description varchar(4000) NOT NULL DEFAULT '',
  status varchar(20) NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
  priority varchar(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  assignee_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX tickets_project ON tickets(project_id);
CREATE TABLE comments (
  id uuid PRIMARY KEY, ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id), body varchar(2000) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  sequence bigint GENERATED ALWAYS AS IDENTITY
);
CREATE INDEX comments_ticket ON comments(ticket_id);
CREATE TABLE activity (
  id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES users(id), message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  sequence bigint GENERATED ALWAYS AS IDENTITY
);
