import { Database } from './database';
import { hashPassword } from './password';
import { randomUUID } from 'node:crypto';

export async function seed(db: Database) {
  if (process.env.SEED_DEMO === 'false' || (await db.get('SELECT id FROM users LIMIT 1'))) return;
  const password = process.env.DEMO_PASSWORD || 'TeamFlow-local-2026!';
  const email = (process.env.DEMO_EMAIL || 'alex@teamflow.local').toLowerCase();
  const hash = await hashPassword(password);
  await db.transaction(async () => {
    await db.run('SELECT pg_advisory_xact_lock(742020)');
    if (await db.get('SELECT id FROM users LIMIT 1')) return;
    const user = randomUUID();
    await db.run(
      'INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',
      user,
      'Alex Morgan',
      email,
      hash,
    );
    const projects = [
      {
        name: 'Platform launch',
        description: 'A shared home for the work that moves our platform forward.',
        tasks: [
          [
            'Design the project dashboard',
            'A clear overview of active work, priorities, and team progress.',
            'done',
            'high',
          ],
          [
            'Build the authentication flow',
            'Make signing in simple and keep workspace sessions secure.',
            'in_progress',
            'high',
          ],
          [
            'Review the API endpoints',
            'Check validation, error messages, and the happy path.',
            'todo',
            'medium',
          ],
          [
            'Write the getting-started guide',
            'Give every teammate an easy path from clone to first contribution.',
            'todo',
            'low',
          ],
        ],
      },
      {
        name: 'Website refresh',
        description: 'A thoughtful refresh of our public website and brand.',
        tasks: [
          [
            'Update the homepage copy',
            'Keep the message focused on the people using our product.',
            'in_progress',
            'medium',
          ],
          [
            'Check mobile layouts',
            'Review navigation and forms on smaller screens.',
            'todo',
            'high',
          ],
        ],
      },
      {
        name: 'Team onboarding',
        description: 'Make the first week feel welcoming and productive.',
        tasks: [
          [
            'Create a welcome checklist',
            'Collect the tools, people, and resources new teammates need.',
            'done',
            'medium',
          ],
        ],
      },
    ];
    for (const project of projects) {
      const id = randomUUID();
      await db.run(
        'INSERT INTO projects(id,name,description) VALUES($1,$2,$3)',
        id,
        project.name,
        project.description,
      );
      for (const [title, description, status, priority] of project.tasks) {
        await db.run(
          'INSERT INTO tickets(id,project_id,title,description,status,priority,assignee_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
          randomUUID(),
          id,
          title,
          description,
          status,
          priority,
          user,
        );
      }
    }
    await db.run(
      'INSERT INTO activity(id,actor_id,message) VALUES($1,$2,$3)',
      randomUUID(),
      user,
      'set up the TeamFlow workspace',
    );
  });
}
