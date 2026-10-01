import { randomUUID } from 'node:crypto';
import { Database } from './database';

// Called inside the same transaction as the business change.
export async function recordActivity(db: Database, actor: string, message: string) {
  const table = process.env.BROKER_ENABLED === 'true' ? 'activity_outbox' : 'activity';
  await db.run(
    `INSERT INTO ${table}(id,actor_id,message) VALUES($1,$2,$3)`,
    randomUUID(),
    actor,
    message,
  );
}

// The broker carries only an ID. The trusted payload stays in PostgreSQL.
// INSERT + DELETE are atomic; duplicate deliveries are harmless.
export async function consumeActivity(db: Database, id: string) {
  await db.transaction(async () => {
    await db.run(
      `INSERT INTO activity(id,actor_id,message,created_at)
      SELECT id,actor_id,message,created_at FROM activity_outbox WHERE id=$1
      ON CONFLICT (id) DO NOTHING`,
      id,
    );
    await db.run('DELETE FROM activity_outbox WHERE id=$1', id);
  });
}
