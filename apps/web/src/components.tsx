import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { X, ArrowRight, Layers3 } from 'lucide-react';
import { api, User } from './api';

export function Logo() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Layers3 size={22} />
      </span>
      <span>
        teamflow<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-content">
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
export function AuthScreen({ onLogin }: { onLogin: (user: User) => void }) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      onLogin(await api<User>(`/auth/${register ? 'register' : 'login'}`, 'POST', values));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Logo />
        <div className="story-copy">
          <span className="eyebrow">LESS FRICTION. MORE FORWARD.</span>
          <h1>
            Great work starts
            <br />
            with a little <em>flow.</em>
          </h1>
          <p>
            A shared space for your projects, your people,
            <br />
            and everything you’re moving forward.
          </p>
          <div className="story-board">
            <div className="story-label">
              <span className="dot green" /> Platform launch <span>↗</span>
            </div>
            <div className="story-task">
              <span className="fake-check">✓</span> Bring the team together
            </div>
            <div className="story-task">
              <span className="fake-check">✓</span> Make room for good ideas
            </div>
            <div className="story-task muted">
              <span className="fake-circle" /> Build something that matters{' '}
              <span className="mini-avatar">AM</span>
            </div>
            <div className="story-progress">
              <span />
            </div>
            <small>A little progress, every day.</small>
          </div>
        </div>
        <span className="story-footer">A calmer place to get things done.</span>
      </section>
      <section className="auth-form-area">
        <div className="auth-form">
          <span className="eyebrow">YOUR TEAM’S NEXT CHAPTER</span>
          <h2>{register ? 'Make yourself at home.' : 'Welcome back.'}</h2>
          <p className="muted">
            {register
              ? 'Create an account to join the shared workspace.'
              : 'Pick up where you left off.'}
          </p>
          {!register && (
            <p className="demo-note">
              Demo login: <strong>alex@teamflow.local</strong>
              <br />
              Password: <strong>TeamFlow-local-2026!</strong>
            </p>
          )}
          <form onSubmit={submit} key={String(register)}>
            {register && (
              <label>
                Full name
                <input
                  name="name"
                  placeholder="Alex Morgan"
                  minLength={2}
                  maxLength={80}
                  required
                  autoComplete="name"
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                maxLength={254}
                autoComplete="email"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                placeholder={register ? 'At least 12 characters' : 'Your password'}
                required
                minLength={register ? 12 : 1}
                maxLength={200}
                autoComplete={register ? 'new-password' : 'current-password'}
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? 'One moment…' : register ? 'Create account' : 'Sign in'}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="auth-switch">
            {register ? 'Already part of the team?' : 'New to TeamFlow?'}{' '}
            <button
              onClick={() => {
                setRegister(!register);
                setError('');
              }}
            >
              {register ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
