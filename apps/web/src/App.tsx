import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  Activity as ActivityIcon,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  Circle,
  CircleCheck,
  Clock3,
  FolderClosed,
  LayoutDashboard,
  LayoutGrid,
  List,
  LogOut,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  Activity,
  api,
  ApiError,
  Comment,
  date,
  initials,
  Project,
  Status,
  statusNames,
  Ticket,
  User,
  Workspace,
} from './api';
import { AuthScreen, Logo, Modal } from './components';

type Page = 'overview' | 'projects' | 'tasks' | 'team' | 'activity';
type TicketDraft = {
  title: string;
  description: string;
  projectId: string;
  priority: string;
  assigneeId: string;
  status: Status;
};
const empty: Workspace = { projects: [], tickets: [], members: [], activity: [] };

export function App() {
  const [user, setUser] = useState<User | null>(null),
    [starting, setStarting] = useState(true),
    [data, setData] = useState<Workspace>(empty);
  const [page, setPage] = useState<Page>('overview'),
    [projectId, setProjectId] = useState(''),
    [search, setSearch] = useState(''),
    [priority, setPriority] = useState('all'),
    [view, setView] = useState<'board' | 'list'>('board');
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false);
  const [projectModal, setProjectModal] = useState<Project | 'new' | null>(null),
    [ticketModal, setTicketModal] = useState<Ticket | 'new' | null>(null),
    [deleteProject, setDeleteProject] = useState<Project | null>(null);
  const [draft, setDraft] = useState<TicketDraft>({
      title: '',
      description: '',
      projectId: '',
      priority: 'medium',
      assigneeId: '',
      status: 'todo',
    }),
    [comments, setComments] = useState<Comment[]>([]),
    [commentBody, setCommentBody] = useState(''),
    [commentsLoading, setCommentsLoading] = useState(false);
  const [confirmTicketDelete, setConfirmTicketDelete] = useState(false);
  const handleError = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.status === 401) {
      setUser(null);
      setData(empty);
    }
    setError((err as Error).message);
  }, []);
  const refresh = useCallback(async () => {
    const next = await api<Workspace>('/workspace');
    setData(next);
  }, []);
  useEffect(() => {
    api<User>('/auth/me')
      .then(setUser)
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) setError((err as Error).message);
      })
      .finally(() => setStarting(false));
  }, []);
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    refresh()
      .catch(handleError)
      .finally(() => setLoading(false));
  }, [user, refresh, handleError]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    let pending = false;
    const timer = setInterval(async () => {
      if (document.hidden || pending) return;
      pending = true;
      try {
        const next = await api<Workspace>('/workspace');
        if (active) setData(next);
      } catch (err) {
        if (active && err instanceof ApiError && err.status === 401) handleError(err);
      } finally {
        pending = false;
      }
    }, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [user, handleError]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!ticketModal || ticketModal === 'new') {
      setComments([]);
      return;
    }
    let active = true;
    setCommentsLoading(true);
    setComments([]);
    api<Comment[]>(`/tickets/${ticketModal.id}/comments`)
      .then((value) => {
        if (active) setComments(value);
      })
      .catch((err) => {
        if (active) handleError(err);
      })
      .finally(() => {
        if (active) setCommentsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ticketModal, handleError]);

  function navigate(next: Page, id = '') {
    setPage(next);
    setProjectId(id);
    setSearch('');
    setPriority('all');
    setMobile(false);
  }
  function openTicket(ticket: Ticket | 'new') {
    setConfirmTicketDelete(false);
    setCommentBody('');
    setTicketModal(ticket);
    setDraft(
      ticket === 'new'
        ? {
            title: '',
            description: '',
            projectId: projectId || data.projects[0]?.id || '',
            priority: 'medium',
            assigneeId: user?.id || '',
            status: 'todo',
          }
        : {
            title: ticket.title,
            description: ticket.description,
            projectId: ticket.project_id,
            priority: ticket.priority,
            assigneeId: ticket.assignee_id || '',
            status: ticket.status,
          },
    );
  }
  async function mutate(work: () => Promise<unknown>, message: string, after?: () => void) {
    setBusy(true);
    setError('');
    try {
      await work();
      after?.();
      await refresh();
      setNotice(message);
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }
  async function saveTicket(e: FormEvent) {
    e.preventDefault();
    if (!ticketModal) return;
    const editing = ticketModal !== 'new';
    const body = editing
      ? {
          title: draft.title,
          description: draft.description,
          priority: draft.priority,
          status: draft.status,
          assigneeId: draft.assigneeId || null,
        }
      : {
          title: draft.title,
          description: draft.description,
          projectId: draft.projectId,
          priority: draft.priority,
          ...(draft.assigneeId ? { assigneeId: draft.assigneeId } : {}),
        };
    await mutate(
      () =>
        api(editing ? `/tickets/${ticketModal.id}` : '/tickets', editing ? 'PATCH' : 'POST', body),
      editing ? 'Ticket updated.' : 'Ticket created.',
      () => setTicketModal(null),
    );
  }
  async function saveProject(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const editing = projectModal && projectModal !== 'new';
    await mutate(
      () =>
        api(
          editing ? `/projects/${projectModal.id}` : '/projects',
          editing ? 'PATCH' : 'POST',
          body,
        ),
      editing ? 'Project updated.' : 'Project created.',
      () => setProjectModal(null),
    );
  }
  async function logout() {
    try {
      await api('/auth/logout', 'POST');
      setUser(null);
      setData(empty);
      setTicketModal(null);
      setProjectModal(null);
      navigate('overview');
    } catch (err) {
      handleError(err);
    }
  }

  if (starting)
    return (
      <div className="loading-screen">
        <Logo />
        <p>Finding your flow…</p>
      </div>
    );
  if (!user)
    return (
      <AuthScreen
        onLogin={(value) => {
          setError('');
          setUser(value);
        }}
      />
    );
  const currentProject = data.projects.find((p) => p.id === projectId);
  const filtered = data.tickets.filter(
    (t) =>
      (!projectId || t.project_id === projectId) &&
      (priority === 'all' || t.priority === priority) &&
      `${t.title} ${t.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  const done = data.tickets.filter((t) => t.status === 'done').length;
  const inProgress = data.tickets.filter((t) => t.status === 'in_progress').length;
  const titles = {
    overview: 'Workspace overview',
    projects: 'Your projects',
    tasks: 'All tickets',
    team: 'The people behind the work',
    activity: 'Workspace activity',
  };
  const nav = [
    { id: 'overview' as Page, label: 'Overview', icon: LayoutDashboard },
    { id: 'projects' as Page, label: 'Projects', icon: FolderClosed },
    { id: 'tasks' as Page, label: 'All tickets', icon: CheckCheck },
    { id: 'team' as Page, label: 'Team members', icon: Users },
    { id: 'activity' as Page, label: 'Activity', icon: ActivityIcon },
  ];
  const member = (id: string | null) => data.members.find((m) => m.id === id);

  function ticketCard(ticket: Ticket) {
    const assignee = member(ticket.assignee_id);
    return (
      <button key={ticket.id} className="ticket-card" onClick={() => openTicket(ticket)}>
        <div className="ticket-top">
          <span className={`priority ${ticket.priority}`}>
            <span className="dot" />
            {ticket.priority}
          </span>
          <span className="ticket-code">TF-{ticket.id.slice(0, 4).toUpperCase()}</span>
        </div>
        <h3>{ticket.title}</h3>
        <p>{ticket.description || 'No description yet.'}</p>
        <footer>
          <span className="ticket-project">
            <FolderClosed size={13} />
            {data.projects.find((p) => p.id === ticket.project_id)?.name}
          </span>
          {assignee ? (
            <span className="avatar small" title={assignee.name}>
              {initials(assignee.name)}
            </span>
          ) : (
            <span className="unassigned">Unassigned</span>
          )}
        </footer>
      </button>
    );
  }
  function activityList(items: Activity[]) {
    return items.length ? (
      <div className="activity-list">
        {items.map((item) => (
          <div className="activity-item" key={item.id}>
            <span className="avatar small">{initials(item.actor_name)}</span>
            <div>
              <p>
                <strong>{item.actor_name}</strong> {item.message}
              </p>
              <time>
                {date(item.created_at)} ·{' '}
                {new Date(item.created_at).toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="empty-state compact">
        <ActivityIcon />
        <h3>A fresh start</h3>
        <p>Your team’s updates will appear here.</p>
      </div>
    );
  }

  return (
    <div className="app-layout">
      {mobile && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? 'open' : ''}`}>
        <Logo />
        <div className="workspace-switch">
          <span className="workspace-symbol">S</span>
          <div>
            <strong>Studio workspace</strong>
            <small>Let’s build something good</small>
          </div>
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {nav.map((item) => (
            <button
              key={item.id}
              className={page === item.id && !projectId ? 'active' : ''}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.id === 'tasks' && <span className="nav-count">{data.tickets.length}</span>}
            </button>
          ))}
        </nav>
        <div className="nav-label project-label">
          YOUR PROJECTS
          <button aria-label="Create project" onClick={() => setProjectModal('new')}>
            <Plus size={16} />
          </button>
        </div>
        <div className="project-nav">
          {data.projects.map((project, i) => (
            <button
              key={project.id}
              className={projectId === project.id ? 'selected' : ''}
              onClick={() => navigate('tasks', project.id)}
            >
              <span className={`project-dot color-${i % 3}`} />
              <span>{project.name}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span>MAKE SPACE FOR PROGRESS</span>
            <p>
              Small steps.
              <br />
              Good things ahead.
            </p>
            <div className="note-lines">
              <span />
              <span />
              <span />
            </div>
          </div>
          <div className="profile">
            <span className="avatar">{initials(user.name)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>Workspace member</small>
            </div>
            <button className="icon-button" onClick={logout} aria-label="Sign out" title="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobile(true)}
              aria-label="Open navigation"
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>
              {currentProject?.name ||
                {
                  overview: 'Overview',
                  projects: 'Projects',
                  tasks: 'All tickets',
                  team: 'Team members',
                  activity: 'Activity',
                }[page]}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="today">
              {new Date().toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </span>
            <span className="avatar small">{initials(user.name)}</span>
          </div>
        </header>
        <main className="main-content">
          {error && (
            <div className="error banner" role="alert">
              {error}
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError('')}
              >
                <X size={17} />
              </button>
              <button
                className="text-button"
                onClick={() =>
                  refresh()
                    .then(() => setError(''))
                    .catch(handleError)
                }
              >
                Retry
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {page === 'overview'
                  ? 'A LITTLE CLARITY FOR YOUR DAY'
                  : 'KEEP THE GOOD WORK MOVING'}
              </span>
              <h1>
                {page === 'overview'
                  ? `Hello, ${user.name.split(' ')[0]}.`
                  : currentProject?.name || titles[page]}
              </h1>
              <p>
                {currentProject?.description ||
                  {
                    overview: 'Here’s what’s happening across your team today.',
                    projects: 'Big ideas, broken into meaningful next steps.',
                    tasks: 'Every next step, all in one place.',
                    team: 'Good work happens together. Everyone here shares this workspace.',
                    activity: 'A running story of your team’s progress.',
                  }[page]}
              </p>
            </div>
            <div className="heading-actions">
              {currentProject && (
                <button
                  className="button secondary"
                  onClick={() => setProjectModal(currentProject)}
                >
                  <Pencil size={15} />
                  Edit project
                </button>
              )}
              {page === 'projects' ? (
                <button className="button primary" onClick={() => setProjectModal('new')}>
                  <Plus size={17} />
                  New project
                </button>
              ) : (
                page !== 'team' &&
                page !== 'activity' && (
                  <button
                    className="button primary"
                    disabled={!data.projects.length || loading}
                    onClick={() => openTicket('new')}
                  >
                    <Plus size={17} />
                    New ticket
                  </button>
                )
              )}
            </div>
          </div>
          {loading ? (
            <div className="empty-state">
              <Clock3 />
              <h3>Loading your workspace…</h3>
            </div>
          ) : (
            <>
              {page === 'overview' && (
                <>
                  <section className="stats-grid" aria-label="Workspace statistics">
                    {[
                      {
                        label: 'Total projects',
                        value: data.projects.length,
                        icon: FolderClosed,
                        detail: 'Room for your next big idea',
                        className: 'purple',
                      },
                      {
                        label: 'In progress',
                        value: inProgress,
                        icon: Clock3,
                        detail: 'Good things are taking shape',
                        className: 'orange',
                      },
                      {
                        label: 'Completed tickets',
                        value: done,
                        icon: CircleCheck,
                        detail: 'A little closer to the goal',
                        className: 'green',
                      },
                      {
                        label: 'Team members',
                        value: data.members.length,
                        icon: Users,
                        detail: 'Better when we work together',
                        className: 'blue',
                      },
                    ].map((stat) => (
                      <div className="stat-card" key={stat.label}>
                        <div className="stat-heading">
                          <span>{stat.label}</span>
                          <span className={`stat-icon ${stat.className}`}>
                            <stat.icon size={18} />
                          </span>
                        </div>
                        <strong>{stat.value.toString().padStart(2, '0')}</strong>
                        <small>{stat.detail}</small>
                      </div>
                    ))}
                  </section>
                  <section className="section">
                    <div className="section-title">
                      <h2>
                        Your projects <span>{data.projects.length}</span>
                      </h2>
                      <button className="text-button" onClick={() => navigate('projects')}>
                        View all projects
                        <ArrowRight size={15} />
                      </button>
                    </div>
                    <div className="project-grid">
                      {data.projects.slice(0, 3).map((project, i) => (
                        <ProjectCard
                          key={project.id}
                          project={project}
                          index={i}
                          tickets={data.tickets.filter((t) => t.project_id === project.id)}
                          onOpen={() => navigate('tasks', project.id)}
                        />
                      ))}
                      {!data.projects.length && (
                        <button className="empty-project" onClick={() => setProjectModal('new')}>
                          <Plus />
                          <strong>Create your first project</strong>
                          <span>A home for your next idea.</span>
                        </button>
                      )}
                    </div>
                  </section>
                  <div className="overview-bottom">
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>On your radar</h2>
                        <span className="subtle-tag">Assigned to you</span>
                      </div>
                      <div className="radar-list">
                        {data.tickets
                          .filter((t) => t.assignee_id === user.id && t.status !== 'done')
                          .slice(0, 5)
                          .map((ticket) => (
                            <button key={ticket.id} onClick={() => openTicket(ticket)}>
                              <Circle size={18} />
                              <div>
                                <strong>{ticket.title}</strong>
                                <small>
                                  {data.projects.find((p) => p.id === ticket.project_id)?.name}
                                </small>
                              </div>
                              <span className={`priority ${ticket.priority}`}>
                                {ticket.priority}
                              </span>
                              <ChevronRight size={15} />
                            </button>
                          ))}
                        {!data.tickets.some(
                          (t) => t.assignee_id === user.id && t.status !== 'done',
                        ) && (
                          <div className="empty-state compact">
                            <CheckCheck />
                            <h3>You’re all caught up</h3>
                            <p>No open tickets assigned to you.</p>
                          </div>
                        )}
                      </div>
                      <button className="panel-link" onClick={() => navigate('tasks')}>
                        See all tickets
                        <ArrowRight size={15} />
                      </button>
                    </section>
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>Latest activity</h2>
                        <ActivityIcon size={17} />
                      </div>
                      {activityList(data.activity.slice(0, 4))}
                      <button className="panel-link" onClick={() => navigate('activity')}>
                        View workspace activity
                        <ArrowRight size={15} />
                      </button>
                    </section>
                  </div>
                </>
              )}
              {page === 'projects' && (
                <div className="project-grid full-grid">
                  {data.projects.map((project, i) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      index={i}
                      tickets={data.tickets.filter((t) => t.project_id === project.id)}
                      onOpen={() => navigate('tasks', project.id)}
                      onEdit={() => setProjectModal(project)}
                      onDelete={() => setDeleteProject(project)}
                    />
                  ))}
                  <button className="empty-project" onClick={() => setProjectModal('new')}>
                    <Plus />
                    <strong>Something new in mind?</strong>
                    <span>Create a project to get started.</span>
                  </button>
                </div>
              )}
              {page === 'tasks' && (
                <>
                  <div className="ticket-toolbar">
                    <div className="search-field">
                      <Search size={17} />
                      <input
                        aria-label="Search tickets"
                        placeholder="Search tickets…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <select
                      aria-label="Filter by priority"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                    >
                      <option value="all">All priorities</option>
                      <option value="high">High priority</option>
                      <option value="medium">Medium priority</option>
                      <option value="low">Low priority</option>
                    </select>
                    <span className="results-count">{filtered.length} tickets</span>
                    <div className="view-toggle">
                      <button
                        aria-label="Board view"
                        aria-pressed={view === 'board'}
                        className={view === 'board' ? 'selected' : ''}
                        onClick={() => setView('board')}
                      >
                        <LayoutGrid size={17} />
                      </button>
                      <button
                        aria-label="List view"
                        aria-pressed={view === 'list'}
                        className={view === 'list' ? 'selected' : ''}
                        onClick={() => setView('list')}
                      >
                        <List size={17} />
                      </button>
                    </div>
                  </div>
                  {!data.projects.length ? (
                    <div className="empty-state">
                      <FolderClosed />
                      <h3>A project is a good place to start</h3>
                      <p>Create a project, then add your first ticket.</p>
                      <button className="button primary" onClick={() => setProjectModal('new')}>
                        Create project
                      </button>
                    </div>
                  ) : view === 'board' ? (
                    <div className="board">
                      {(['todo', 'in_progress', 'done'] as Status[]).map((status) => (
                        <section className={`board-column ${status}`} key={status}>
                          <header>
                            <h2>
                              <span className="dot" />
                              {statusNames[status]}
                              <span className="column-count">
                                {filtered.filter((t) => t.status === status).length}
                              </span>
                            </h2>
                            <MoreHorizontal size={18} />
                          </header>
                          <div className="column-cards">
                            {filtered.filter((t) => t.status === status).map(ticketCard)}
                            {!filtered.some((t) => t.status === status) && (
                              <p className="column-empty">
                                {search || priority !== 'all'
                                  ? 'No matching tickets.'
                                  : 'Nothing here just yet.'}
                              </p>
                            )}
                          </div>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <div className="ticket-table">
                      <div className="table-heading">
                        <span>Ticket</span>
                        <span>Status</span>
                        <span>Priority</span>
                        <span>Assignee</span>
                      </div>
                      {filtered.map((ticket) => (
                        <button
                          className="table-row"
                          key={ticket.id}
                          onClick={() => openTicket(ticket)}
                        >
                          <span>
                            <strong>{ticket.title}</strong>
                            <small>
                              {data.projects.find((p) => p.id === ticket.project_id)?.name}
                            </small>
                          </span>
                          <span className={`status ${ticket.status}`}>
                            {statusNames[ticket.status]}
                          </span>
                          <span className={`priority ${ticket.priority}`}>{ticket.priority}</span>
                          <span>{member(ticket.assignee_id)?.name || 'Unassigned'}</span>
                        </button>
                      ))}
                      {!filtered.length && (
                        <div className="empty-state compact">
                          <Search />
                          <h3>No tickets found</h3>
                          <p>Try a different search or priority.</p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              {page === 'team' && (
                <>
                  <div className="info-note">
                    <Users size={18} />
                    <p>
                      This is one shared workspace. New accounts join this team and can collaborate
                      on all projects.
                    </p>
                  </div>
                  <div className="members-grid">
                    {data.members.map((person) => (
                      <div className="member-card" key={person.id}>
                        <span className="avatar large">{initials(person.name)}</span>
                        <h3>
                          {person.name}
                          {person.id === user.id && <span className="you-tag">You</span>}
                        </h3>
                        <p>{person.email}</p>
                        <span className="subtle-tag">
                          {
                            data.tickets.filter(
                              (t) => t.assignee_id === person.id && t.status !== 'done',
                            ).length
                          }{' '}
                          open tickets
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {page === 'activity' && (
                <section className="panel activity-panel">
                  <div className="panel-heading">
                    <h2>Recent updates</h2>
                    <span className="subtle-tag">Latest 30</span>
                  </div>
                  {activityList(data.activity)}
                </section>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>Made for a little more momentum.</span>
            <span>
              TeamFlow <span className="dot green" /> Your work, in flow
            </span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
      {projectModal && (
        <Modal
          title={projectModal === 'new' ? 'A new place for your next idea' : 'Edit project'}
          onClose={() => {
            if (!busy) setProjectModal(null);
          }}
        >
          <form onSubmit={saveProject}>
            <label>
              Project name
              <input
                name="name"
                required
                maxLength={80}
                defaultValue={projectModal === 'new' ? '' : projectModal.name}
                placeholder="e.g. Product launch"
                autoFocus
              />
            </label>
            <label>
              Description
              <textarea
                name="description"
                maxLength={500}
                rows={4}
                defaultValue={projectModal === 'new' ? '' : projectModal.description}
                placeholder="What are we working toward?"
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setProjectModal(null)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? 'Saving…' : projectModal === 'new' ? 'Create project' : 'Save changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {ticketModal && (
        <Modal
          wide
          title={
            ticketModal === 'new'
              ? 'Make the next step clear'
              : `TF-${ticketModal.id.slice(0, 4).toUpperCase()} · Ticket details`
          }
          onClose={() => {
            if (!busy) setTicketModal(null);
          }}
        >
          <form onSubmit={saveTicket}>
            <label>
              Title
              <input
                autoFocus
                required
                maxLength={160}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="What needs to happen?"
              />
            </label>
            <label>
              Description
              <textarea
                rows={3}
                maxLength={4000}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="Add a little context for the team…"
              />
            </label>
            <div className="form-grid">
              {ticketModal === 'new' ? (
                <label>
                  Project
                  <select
                    required
                    value={draft.projectId}
                    onChange={(e) => setDraft({ ...draft, projectId: e.target.value })}
                  >
                    {data.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  Status
                  <select
                    value={draft.status}
                    onChange={(e) => setDraft({ ...draft, status: e.target.value as Status })}
                  >
                    {Object.entries(statusNames).map(([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Priority
                <select
                  value={draft.priority}
                  onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label>
                Assignee
                <select
                  value={draft.assigneeId}
                  onChange={(e) => setDraft({ ...draft, assigneeId: e.target.value })}
                >
                  <option value="">Unassigned</option>
                  {data.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              {ticketModal !== 'new' && (
                <button
                  type="button"
                  className="button danger quiet"
                  onClick={() => setConfirmTicketDelete(true)}
                  disabled={busy}
                >
                  <Trash2 size={15} />
                  Delete
                </button>
              )}
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setTicketModal(null)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? 'Saving…' : ticketModal === 'new' ? 'Create ticket' : 'Save changes'}
              </button>
            </div>
          </form>
          {confirmTicketDelete && ticketModal !== 'new' && (
            <div className="delete-inline">
              <p>Delete this ticket and all its comments? This cannot be undone.</p>
              <button
                className="button danger"
                disabled={busy}
                onClick={() =>
                  mutate(
                    () => api(`/tickets/${ticketModal.id}`, 'DELETE'),
                    'Ticket deleted.',
                    () => setTicketModal(null),
                  )
                }
              >
                Yes, delete ticket
              </button>
              <button className="text-button" onClick={() => setConfirmTicketDelete(false)}>
                Keep ticket
              </button>
            </div>
          )}
          {ticketModal !== 'new' && (
            <section className="comments">
              <h3>
                <MessageSquare size={17} />
                Conversation <span>{comments.length}</span>
              </h3>
              {commentsLoading ? (
                <p className="muted">Loading comments…</p>
              ) : (
                comments.map((comment) => (
                  <div className="comment" key={comment.id}>
                    <span className="avatar small">{initials(comment.author_name)}</span>
                    <div>
                      <strong>{comment.author_name}</strong>
                      <time>{date(comment.created_at)}</time>
                      <p>{comment.body}</p>
                    </div>
                  </div>
                ))
              )}
              {!commentsLoading && !comments.length && (
                <p className="muted">Start a conversation. Keep the context close to the work.</p>
              )}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await mutate(async () => {
                    const result = await api<Comment[]>(
                      `/tickets/${ticketModal.id}/comments`,
                      'POST',
                      { body: commentBody },
                    );
                    setComments(result);
                    setCommentBody('');
                  }, 'Comment added.');
                }}
              >
                <label className="sr-only" htmlFor="comment-body">
                  Comment
                </label>
                <textarea
                  id="comment-body"
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  required
                  maxLength={2000}
                  rows={2}
                  placeholder="Leave a comment…"
                />
                <button className="button secondary" disabled={busy || !commentBody.trim()}>
                  Add comment
                  <ArrowRight size={14} />
                </button>
              </form>
            </section>
          )}
        </Modal>
      )}
      {deleteProject && (
        <Modal
          title="Delete this project?"
          onClose={() => {
            if (!busy) setDeleteProject(null);
          }}
        >
          <p className="delete-description">
            “{deleteProject.name}” and all its tickets and comments will be permanently deleted.
          </p>
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setDeleteProject(null)}
            >
              Keep project
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() =>
                mutate(
                  () => api(`/projects/${deleteProject.id}`, 'DELETE'),
                  'Project deleted.',
                  () => {
                    if (projectId === deleteProject.id) navigate('projects');
                    setDeleteProject(null);
                  },
                )
              }
            >
              Delete project
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ProjectCard({
  project,
  index,
  tickets,
  onOpen,
  onEdit,
  onDelete,
}: {
  project: Project;
  index: number;
  tickets: Ticket[];
  onOpen: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const done = tickets.filter((t) => t.status === 'done').length,
    progress = tickets.length ? Math.round((done / tickets.length) * 100) : 0;
  return (
    <article className="project-card">
      <div className="project-card-top">
        <span className={`project-icon color-${index % 3}`}>
          <FolderClosed size={21} />
        </span>
        <div>
          {onEdit && (
            <button className="icon-button" onClick={onEdit} aria-label={`Edit ${project.name}`}>
              <Pencil size={15} />
            </button>
          )}
          {onDelete && (
            <button
              className="icon-button"
              onClick={onDelete}
              aria-label={`Delete ${project.name}`}
            >
              <Trash2 size={15} />
            </button>
          )}
          <span className="subtle-tag">
            {tickets.length && progress === 100 ? 'Completed' : 'Active'}
          </span>
        </div>
      </div>
      <button className="project-open" onClick={onOpen}>
        <h3>
          {project.name}
          <ArrowRight size={16} />
        </h3>
        <p>{project.description || 'A new space for good work.'}</p>
      </button>
      <div className="progress-label">
        <span>Progress</span>
        <strong>{progress}%</strong>
      </div>
      <div className="progress-track">
        <span style={{ width: `${progress}%` }} />
      </div>
      <footer>
        <span>
          <CheckCheck size={14} />
          {done} / {tickets.length} tickets
        </span>
        <span>
          View project
          <ChevronRight size={13} />
        </span>
      </footer>
    </article>
  );
}
