# TeamFlow

A full-stack project and ticket tracker for DevOps and cloud learning, built with React, TypeScript, NestJS, Node.js 24, and PostgreSQL.

## What it does

- Account registration, sign-in, and sessions.
- Shared projects and tickets with status, priority, assignees, and comments.
- Dashboard, board/list views, team directory, and activity history.
- Persistent PostgreSQL storage and responsive desktop/mobile layouts.

All accounts share one workspace. This learning app does not implement private organizations, administrator roles, email delivery, or public password recovery.

## Run locally

Optional Redis caching and RabbitMQ background activity processing are documented in
[Cache and broker setup](docs/CACHE_AND_BROKER.md). Both are disabled by default.

See [the step-by-step Git Bash guide](docs/RUN_LOCALLY.md).

For this existing installation, start PostgreSQL in one terminal:

```bash
cd /c/Users/udemy/Desktop/Devops/TeamFlow
npm run db:start
```

Start the app in a second terminal:

```bash
cd /c/Users/udemy/Desktop/Devops/TeamFlow
npm run dev
```

Open [TeamFlow](http://127.0.0.1:5173).

**Demo email:** `alex@teamflow.local`  
**Demo password:** `TeamFlow-local-2026!`

For a fresh checkout, run `npm ci` and `npm run db:setup` first. Use Node.js 24. Stop the app and database before reinstalling dependencies. Stop each terminal with Ctrl+C when finished.

## Configuration

The backend and database scripts read the root `.env`. An already-set environment variable takes precedence. Restart the app after changing configuration.

| Setting                       | Purpose                                                   |
| ----------------------------- | --------------------------------------------------------- |
| `PORT=3000`                   | Backend API port; frontend proxy uses this setting        |
| `DATABASE_URL`                | PostgreSQL connection string                              |
| `TEST_DATABASE_URL`           | Separate database ending in `_test` for automated tests   |
| `SEED_DEMO=true`              | Seed the sample account/workspace if there are no users   |
| `DEMO_EMAIL`, `DEMO_PASSWORD` | Optional overrides for initial demo seeding               |
| `COOKIE_SECURE=false`         | Local HTTP cookie setting; HTTPS deployments require true |

`db:setup` generates working database passwords and saves them in `.env` and `data/postgres-admin.json`. Editing a connection string does not change an existing database role's password. Changing seed settings does not change existing accounts.

The extra encrypted-store commands and Git secret-check hook have been removed. `.env` and `data/` remain excluded from Git; commit the placeholder `.env.example` only. Public demo credentials are for local learning, not a public deployment. Application passwords are still stored as salted hashes in PostgreSQL.

## Source layout

- `apps/api/src/`: backend API, authentication, database queries, and seeding.
- `apps/api/migrations/`: PostgreSQL schema migrations.
- `apps/api/test/`: API and database integration tests.
- `apps/web/src/`: React UI and styles.
- `apps/web/test/`: browser tests.
- `scripts/`: local PostgreSQL setup/start/stop and test helpers.
- `data/`: local PostgreSQL cluster and legacy SQLite backup; excluded from Git.

## Useful commands

| Command                                | Purpose                                           |
| -------------------------------------- | ------------------------------------------------- |
| `npm run dev`                          | Run frontend and backend                          |
| `npm run db:setup`                     | Configure the local database on first setup       |
| `npm run db:start` / `npm run db:stop` | Start or stop local PostgreSQL                    |
| `npm run db:check`                     | Verify database connectivity                      |
| `npm run db:migrate`                   | Apply schema migrations explicitly                |
| `npm run db:import:sqlite`             | One-time import into an empty PostgreSQL database |
| `npm run build`                        | Build frontend and backend                        |
| `npm run typecheck`                    | Check TypeScript                                  |
| `npm test`                             | Run API/database tests                            |
| `npm run test:e2e`                     | Run browser tests                                 |
| `npm run format:check`                 | Check formatting                                  |

Start PostgreSQL before tests. Tests use isolated schemas in `teamflow_test`, preserving your workspace. Browser tests need the app stopped and Chromium installed with `npx playwright install chromium`; they start their own app processes. Alternatively, use `PLAYWRIGHT_CHANNEL=msedge npm run test:e2e` from Git Bash with Edge installed.

For pgAdmin, backups, and migration details, see [the PostgreSQL guide](docs/POSTGRESQL.md).
