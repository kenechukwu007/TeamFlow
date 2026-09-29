export type User = { id: string; name: string; email: string };
export type Project = { id: string; name: string; description: string; created_at: string };
export type Status = 'todo' | 'in_progress' | 'done';
export type Ticket = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: Status;
  priority: 'low' | 'medium' | 'high';
  assignee_id: string | null;
  created_at: string;
  updated_at: string;
};
export type Comment = { id: string; body: string; author_name: string; created_at: string };
export type Activity = { id: string; actor_name: string; message: string; created_at: string };
export type Workspace = {
  projects: Project[];
  tickets: Ticket[];
  members: User[];
  activity: Activity[];
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-TeamFlow-Client': 'web' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({ message: 'The server could not complete this request.' }));
    throw new ApiError(
      Array.isArray(data.message)
        ? data.message.join(' ')
        : data.message || 'Something went wrong.',
      response.status,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const statusNames: Record<Status, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
};
export const initials = (name: string) =>
  name
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
export const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
