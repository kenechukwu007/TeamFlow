# Cache and background activity

Branch: `feature/cache-message-broker`.

## What changes

- PostgreSQL remains the permanent store for projects and tickets.
- Redis caches the shared dashboard response for 30 seconds.
- A PostgreSQL transaction snapshot identifies each cache version. Committing a write changes the snapshot.
- Each revision uses a separate cache key. Old keys expire automatically.
- Requests still check the session in PostgreSQL before accessing cached data.
- A small snapshot query still runs on every dashboard request. Unrelated database writes can also cause cache misses. This deliberately favors freshness over hit rate.
- Redis failures fall back to PostgreSQL. Cache operations have a 300 ms deadline.
- With messaging enabled, project and ticket changes save an activity event in PostgreSQL in the same transaction.
- A separate worker sends the event ID to RabbitMQ.
- The worker consumes the event and adds the activity entry.
- The activity feed refreshes every five seconds while the browser tab is visible.

The app currently has one shared workspace. Do not reuse these cache keys for a future multi-tenant design without adding tenant scope. Session tokens and password hashes are never cached.

## Configuration

Add these settings to the root `.env`. Keep that file out of Git.

```dotenv
REDIS_URL=
CACHE_TTL_SECONDS=30
CACHE_PREFIX=teamflow:production:workspace:v1
BROKER_ENABLED=false
AMQP_URL=
AMQP_QUEUE=teamflow.activity.v1
```

- An empty `REDIS_URL` disables caching.
- `BROKER_ENABLED=false` keeps the original synchronous activity feed.
- Each environment must have its own cache prefix and broker queue.
- Each worker must use the same database and queue as its API.
- The worker always drains outstanding events even if the API has disabled new asynchronous events.
- Restart processes after changing their environment.

Local connection URL shapes:

```dotenv
REDIS_URL=redis://127.0.0.1:6379
AMQP_URL=amqp://USER:URL_ENCODED_PASSWORD@127.0.0.1:5672
```

These examples assume you have already installed the services. The application does not install or provision them.

## AWS service choices

- Use an ElastiCache Valkey or Redis OSS replication group with **cluster mode disabled** for this client.
- Use its primary endpoint.
- Enable in-transit encryption and configure credentials.
- Use `rediss://USER:URL_ENCODED_PASSWORD@PRIMARY_ENDPOINT:6379`.
- Cluster-mode-enabled and serverless caches need a cluster-aware client and are not supported by this implementation.
- Use Amazon MQ for **RabbitMQ**. ActiveMQ is a different protocol choice.
- Use `amqps://USER:URL_ENCODED_PASSWORD@BROKER_ENDPOINT:5671?heartbeat=30`.
- Use a private broker and cache reachable from the EC2 VPC.
- Allow cache port 6379 from the EC2 security group.
- Allow broker port 5671 from the EC2 security group.
- Keep both services off the public internet.
- Keep TLS certificate verification enabled.

## Build and migrate on Ubuntu

After the branch has been committed and pushed:

```bash
cd ~/apps/TeamFlow
git fetch origin
git switch feature/cache-message-broker
git pull --ff-only
npm ci --include=dev
npm run build
npm run db:migrate
```

The new migration adds the activity outbox table and its index. It preserves existing application records. Do not edit already-applied migration files.

## Start the worker

First configure `AMQP_URL` in `.env`. Leave `BROKER_ENABLED=false` until the worker connects successfully.

For a terminal trial:

```bash
cd ~/apps/TeamFlow
npm run worker
```

Look for `worker_ready`. Stop the terminal trial with Ctrl+C before enabling the service.

For the server, find your absolute Node path:

```bash
command -v node
sudo nano /etc/systemd/system/teamflow-worker.service
```

Paste this unit. Replace `ABSOLUTE_NODE_PATH` with the output above:

```ini
[Unit]
Description=TeamFlow activity worker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/apps/TeamFlow
ExecStart=ABSOLUTE_NODE_PATH /home/ubuntu/apps/TeamFlow/apps/api/dist/worker.js
Restart=on-failure
RestartSec=10
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now teamflow-worker
sudo journalctl -u teamflow-worker -n 50 --no-pager
```

- Set `BROKER_ENABLED=true` in the project `.env`.
- Set `REDIS_URL` in the same file.
- Restart the API.
- Copy the new frontend build to the existing Nginx web directory.

```bash
sudo systemctl restart teamflow
sudo cp -a apps/web/dist/. /var/www/teamflow/
```

## Verify in the browser

- Sign in at your existing HTTPS domain.
- Create a project or ticket.
- Open the activity page.
- Wait up to five seconds for the asynchronous entry.
- Open `/api/operations` in a second tab on the same domain while signed in.
- Check `cache.enabled` and `cache.ready`.
- Refresh the dashboard twice.
- Check that `cache.hits` increases.
- Check that `broker.pending` returns to zero after processing.

The operations endpoint requires a session. Counters belong to one API process and reset on restart. `broker.enabled` reports configuration only. `pending` reports the durable backlog; it is not a broker connection health check.

## Recovery checks

- Stop the worker using `sudo systemctl stop teamflow-worker`.
- Create a ticket.
- Confirm that the ticket saves immediately.
- Confirm that the pending count increases.
- Start the worker using `sudo systemctl start teamflow-worker`.
- Wait up to 35 seconds for any leased event to become available.
- Confirm that the activity appears once and the pending count returns to zero.

The worker uses persistent messages and publisher confirmations. It acknowledges consumption only after PostgreSQL commits. Events remain in the outbox until consumed. A 30-second lease lets another worker retry abandoned delivery. Delivery is at least once; the event ID prevents duplicate activity rows.

Malformed event IDs go to `<AMQP_QUEUE>.dead`. Database or broker errors exit the worker so systemd can restart it after ten seconds. Persistent processing errors require an operator to inspect the database and queue; there is no automatic discard of valid pending events. Monitor outbox growth during outages.

To disable the features:

- Clear `REDIS_URL`.
- Set `BROKER_ENABLED=false`.
- Restart the API.
- Keep the worker running until the pending count reaches zero.
- Stop the worker if no longer needed.
- Keep the additive database migration in place.

## Automated checks

```bash
npm test
npm run build
```

Tests use a separate PostgreSQL database ending in `_test`. They cover rollback, duplicate consumption, revision invalidation, cache hits and cache failure fallback. Redis unit tests use a fake transport. A real Redis/RabbitMQ end-to-end check must also be performed after provisioning; these tests do not certify AWS networking or TLS configuration.

Client references: [Node Redis connection guide](https://redis.io/docs/latest/develop/clients/nodejs/connect/) and [amqplib channel API](https://amqp-node.github.io/amqplib/channel_api.html).

AWS references: [ElastiCache endpoints](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Endpoints.html) and [Amazon MQ for RabbitMQ](https://docs.aws.amazon.com/amazon-mq/latest/developer-guide/working-with-rabbitmq.html).

Cache version reference: [PostgreSQL transaction snapshot functions](https://www.postgresql.org/docs/current/functions-info.html#FUNCTIONS-PG-SNAPSHOT).
