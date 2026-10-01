import './config';
import { connect } from 'amqplib';
import { Database } from './database';
import { consumeActivity } from './activity';
import { log, required } from './config';

async function main() {
  const db = new Database();
  const connection = await connect(required('AMQP_URL'), { timeout: 5000 });
  let stopping = false;
  let busy = false;
  const fail = () => {
    if (!stopping) {
      log('worker_disconnected');
      // systemd restarts the worker; unacknowledged messages are redelivered.
      process.exit(1);
    }
  };
  connection.on('error', fail);
  connection.on('close', fail);
  const publisher = await connection.createConfirmChannel();
  const consumer = await connection.createChannel();
  publisher.on('error', fail);
  publisher.on('close', fail);
  consumer.on('error', fail);
  consumer.on('close', fail);
  const queue = process.env.AMQP_QUEUE || 'teamflow.activity.v1';
  await publisher.assertQueue(`${queue}.dead`, { durable: true });
  await publisher.assertQueue(queue, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': `${queue}.dead` },
  });
  await consumer.prefetch(1);
  await consumer.consume(queue, async (message) => {
    if (!message) return fail();
    const id = message.content.toString();
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
      consumer.nack(message, false, false);
      log('activity_rejected');
      return;
    }
    try {
      await consumeActivity(db, id);
      consumer.ack(message);
      log('activity_processed', { id });
    } catch {
      // Leave the message unacknowledged. Restart delay avoids a hot retry loop.
      fail();
    }
  });
  async function relay() {
    if (busy || stopping) return;
    busy = true;
    try {
      // Avoid acquiring a write transaction ID while the queue is idle.
      if (!(await db.get('SELECT id FROM activity_outbox WHERE available_at<=now() LIMIT 1')))
        return;
      // Short leases allow multiple workers and recovery after a crash.
      const rows = await db.all(`UPDATE activity_outbox SET available_at=now()+interval '30 seconds'
        WHERE id IN (SELECT id FROM activity_outbox WHERE available_at<=now()
          ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED) RETURNING id`);
      for (const row of rows) {
        let timer: NodeJS.Timeout | undefined;
        try {
          await new Promise<void>((resolve, reject) => {
            timer = setTimeout(() => reject(new Error('Publish timeout')), 5000);
            publisher.sendToQueue(
              queue,
              Buffer.from(String(row.id)),
              { persistent: true },
              (error: unknown) => (error ? reject(error) : resolve()),
            );
          });
        } finally {
          clearTimeout(timer);
        }
      }
    } catch {
      fail();
    } finally {
      busy = false;
    }
  }
  const interval = setInterval(() => void relay(), 1000);
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(interval);
    await connection.close();
    await db.onModuleDestroy();
  };
  process.once('SIGTERM', () => void stop());
  process.once('SIGINT', () => void stop());
  log('worker_ready');
  await relay();
}

void main().catch(() => {
  log('worker_start_failed');
  process.exit(1);
});
