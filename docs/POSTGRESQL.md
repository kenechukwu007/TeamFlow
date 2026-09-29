# TeamFlow with PostgreSQL on Windows

TeamFlow now uses a separate PostgreSQL server. These instructions use **Git Bash**, not PowerShell. Node.js 24 and npm are required.

## How the pieces connect

```text
Browser → Vite/React :5173 → NestJS API :3000 → PostgreSQL :5432
```

The frontend never connects directly to PostgreSQL. The backend reads `DATABASE_URL` from the root `.env` or an already-set environment variable. PostgreSQL owns the database files and handles network connections, queries, and transactions.

Two server options are supported:

1. **Included local launcher:** `npm run db:start` starts native PostgreSQL 18 binaries on your computer, without installing a Windows service. This is the setup prepared for this workspace.
2. **An independently installed PostgreSQL server:** configure `DATABASE_URL` and manage the server through Windows Services or your own database tools. Skip the local launcher commands.

The local launcher uses the `embedded-postgres` package to distribute native binaries. Despite the package name, this is a real `postgres.exe` server with a listening port, persistent storage, authentication, and standard PostgreSQL protocol. The application connects using the regular `pg` driver.

## Existing workspace: daily startup

The existing SQLite workspace has already been imported on this computer. **Do not run the import again.**

Open a Git Bash terminal:

```bash
cd /c/Users/udemy/Desktop/Devops/TeamFlow
npm run db:start
```

Wait for the message that PostgreSQL is ready on `127.0.0.1:5432`. Leave the terminal open.

Open a second Git Bash terminal:

```bash
cd /c/Users/udemy/Desktop/Devops/TeamFlow
npm run dev
```

Open **http://127.0.0.1:5173** and sign in using your existing email and password. Previous browser sessions were not copied, so a fresh sign-in is expected.

To stop, press **Ctrl+C in the app terminal first**, then **Ctrl+C in the database terminal**. If the database terminal was closed without stopping the server, run:

```bash
npm run db:stop
```

This command targets only the PostgreSQL cluster in this project's `data/postgres` folder.

## First setup on another computer

### 1. Install the project dependencies

Stop any TeamFlow app/database processes before reinstalling. Windows prevents replacing running `.exe` files.

```bash
cd /path/to/TeamFlow
node --version
npm --version
npm ci
```

Use Node.js 24. Installation downloads the platform's native PostgreSQL binaries along with the application packages, so allow time and disk space for the server.

### 2. Generate local database settings

```bash
npm run db:setup
```

This writes generated application database credentials into `.env` and the administrator password into `data/postgres-admin.json`. Both are ignored by Git. Existing configured connections are kept.

Do not overwrite this generated `.env` with `.env.example`. The example is a template, not your real credentials.

### 3. Start PostgreSQL

```bash
npm run db:start
```

The first run initializes `data/postgres` and creates:

| Item                     | Purpose                                                                |
| ------------------------ | ---------------------------------------------------------------------- |
| `teamflow` database      | Your application workspace                                             |
| `teamflow_test` database | Automated tests                                                        |
| `teamflow` login role    | App/test database owner without superuser or role-creation permissions |

Later starts reuse this cluster. The server listens only on `127.0.0.1`. No Windows service or automatic startup entry is created.

### 4. Import an old SQLite workspace, if you have one

Keep the application stopped throughout migration. Place the old database at `data/teamflow.sqlite`. If copying from another computer, stop the old app before taking a consistent copy of its database and any SQLite sidecar files.

In another terminal:

```bash
npm run db:import:sqlite
```

The command creates PostgreSQL tables, then copies users, projects, tickets, comments, and activity. IDs, relationships, password hashes, and timestamps are preserved. Sessions are omitted so users sign in again. The importer opens SQLite read-only, verifies row counts, and refuses any target that already contains application data.

If an import fails, the data-copy transaction is rolled back; fix the reported issue before retrying. PostgreSQL schema migrations remain applied. A successful import must not be repeated.

For a fresh project, skip the import and start the app. Sample data is enabled by default. Sign in with `alex@teamflow.local` and `TeamFlow-local-2026!`, or register your own account.

### 5. Check the connection and start the app

```bash
npm run db:check
npm run dev
```

`db:check` reports the connected database, role, and PostgreSQL version. It never prints the password. Open **http://127.0.0.1:5173**.

## Configuration reference

Your root `.env` contains `DATABASE_URL`, `TEST_DATABASE_URL`, and backend settings. Read `DATABASE_URL` there when configuring pgAdmin. Do not commit this file.

The username and password authenticate to PostgreSQL. They are separate from the email and password you enter on the TeamFlow sign-in page. URL-encode special characters if supplying your own password in a connection URI; generated passwords use hexadecimal characters and need no encoding.

The local launcher supports changing the port in both URLs. Keep the hostname `127.0.0.1`, username `teamflow`, and application database name `teamflow` when using that launcher. Changing a stored password does not reset the existing PostgreSQL role's password.

`DATABASE_PATH` is obsolete. PostgreSQL data is no longer written to SQLite.

## Inspect the database with pgAdmin

You can optionally install pgAdmin and register this existing server:

| pgAdmin connection field | Value                                     |
| ------------------------ | ----------------------------------------- |
| Name                     | TeamFlow local                            |
| Host name/address        | `127.0.0.1`                               |
| Port                     | `5432`                                    |
| Maintenance database     | `teamflow`                                |
| Username                 | `teamflow`                                |
| Password                 | The password in the `.env` `DATABASE_URL` |

Start `npm run db:start` before connecting. You do not need to install another PostgreSQL server to inspect the existing one. Tables are under **Databases → teamflow → Schemas → public → Tables**.

Example queries for the Query Tool:

```sql
SELECT id, name, email FROM users;
SELECT id, name FROM projects;
SELECT title, status, priority FROM tickets;
SELECT name, applied_at FROM schema_migrations ORDER BY name;
```

## Using a standard Windows PostgreSQL installation instead

Use the installer linked from the [official PostgreSQL Windows download page](https://www.postgresql.org/download/windows/). Keep the server and command-line tools; pgAdmin is optional. Use a supported stable release such as PostgreSQL 18.

Manage that server through Windows Services. Do not also run `npm run db:start` on the same port. For a new installation, use its administrator account in pgAdmin's Query Tool to create a dedicated login role and databases. Execute each `CREATE DATABASE` as a separate statement with auto-commit enabled:

```sql
CREATE ROLE teamflow LOGIN PASSWORD 'choose-a-strong-password';
CREATE DATABASE teamflow OWNER teamflow;
CREATE DATABASE teamflow_test OWNER teamflow;
```

Set `DATABASE_URL` and `TEST_DATABASE_URL` in `.env` for your server, then run `npm run db:migrate` and `npm run dev`. Moving an existing PostgreSQL workspace to another server requires PostgreSQL backup/restore; do not reimport stale SQLite data.

On Linux, an independently installed PostgreSQL server works with the same application code and connection URLs. The optional bundled launcher must run as an ordinary user, never as root.

## Testing

Keep PostgreSQL running. Tests use `TEST_DATABASE_URL`, never your app's `DATABASE_URL`. The test database name must end in `_test`. Each test suite creates a unique schema and removes only its own schema afterward.

```bash
npm test
npm run typecheck
npm run build
```

For browser tests, stop the app but keep PostgreSQL running:

```bash
# Git Bash with Chrome installed
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e

# Or install Playwright's Chromium once, then use it
npx playwright install chromium
npm run test:e2e
```

## Data and backups

| Path                       | Contents                                          |
| -------------------------- | ------------------------------------------------- |
| `data/postgres/`           | Live PostgreSQL cluster; all database records     |
| `data/postgres-admin.json` | Local database administrator password             |
| `data/postgres.log`        | PostgreSQL server log                             |
| `.env`                     | Backend settings and connection credentials       |
| `data/teamflow.sqlite`     | Original SQLite source, unchanged by the importer |

After migration, all new changes go to PostgreSQL. SQLite is not kept synchronized.

For a simple cold backup of the local setup, stop both the app and database, then:

```bash
backup_dir="data-backup-$(date +%Y%m%d-%H%M%S)"
mkdir "$backup_dir"
cp -R data "$backup_dir/data"
cp .env "$backup_dir/.env"
```

Store the backup securely because it contains database records and credentials. Use the same PostgreSQL major version for raw cluster restoration.

Do not update the native PostgreSQL package to a new major version against an existing cluster without planning a database upgrade.

## Troubleshooting

- **Missing DATABASE_URL:** run `npm run db:setup` or configure the connection manually.
- **ECONNREFUSED / connection refused:** start PostgreSQL first and verify the port in the connection string in `.env`.
- **Port 5432 already in use:** another server may already be running. Use `npm run db:check` to check your configured server. Do not stop unrelated services.
- **Existing SQLite workspace found:** import it before the first app start. If deliberately starting empty, set `SEED_DEMO=false` instead.
- **Import target is not empty:** an import may already have succeeded or the app may have seeded records. The importer deliberately refuses to merge or overwrite them.
- **Password authentication failed:** check the connection in `.env` against the role's actual password. Do not delete the cluster or its administrator credential to fix authentication.
- **Missing native binaries:** reinstall dependencies with `npm ci` after stopping both servers. Keep npm optional dependencies enabled. If your package manager blocks required native-package installation scripts, review and enable those scripts.
- **EPERM unlink:** stop both TeamFlow and its PostgreSQL server before `npm ci`.
- **Unclean shutdown:** PostgreSQL normally recovers from its write-ahead log on restart. Check `data/postgres.log`; do not manually remove database files.
