'use client';

import React from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface BoundaryProps {
  /** The pathname of the current page — used for contextual logging. */
  pathname?: string;
  children: React.ReactNode;
  /** Optional custom fallback rendered instead of the default error UI. */
  fallback?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Boundary
// ---------------------------------------------------------------------------

/**
 * Boundary — top-level React error boundary for the Solarinvest Monitor web
 * app.
 *
 * ## Structured logging (React error #426 context)
 *
 * All captured errors are logged with a `[boundary]` prefix that includes:
 *   - `pathname`       — the current URL path
 *   - `isOAuthCallback` — whether the error occurred on an OAuth callback path
 *   - `timestamp`      — ISO-8601 timestamp
 *   - `componentStack` — React component stack from `getDerivedStateFromError`
 *
 * This makes it easy to correlate boundary events with React error #426
 * incidents that were previously surfaced as unhandled exceptions.
 *
 * ## UI affordances
 *   - **Reload** button — hard-reloads the page, clearing all React state.
 *   - **Tentar novamente** (soft-reset) button — clears the boundary state so
 *     React re-attempts to render the subtree without a full page reload.
 *   - Context-aware message — displays a specific hint when the error occurs
 *     on an OAuth callback path.
 */
export class Boundary extends React.Component<BoundaryProps, BoundaryState> {
  private componentStack: string | null = null;

  constructor(props: BoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const pathname = this.props.pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
    const isOAuthCallback = pathname.startsWith('/handler/') || pathname === '/oauth/callback';

    this.componentStack = info.componentStack ?? null;

    // Structured [boundary]-prefixed log for easy log-aggregation queries.
    console.error('[boundary] error caught', {
      pathname,
      isOAuthCallback,
      timestamp: new Date().toISOString(),
      message: error.message,
      componentStack: this.componentStack,
    });
  }

  private handleReload = (): void => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleSoftReset = (): void => {
    this.componentStack = null;
    this.setState({ hasError: false, error: null });
  };

  override render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    const pathname = this.props.pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
    const isOAuthCallback = pathname.startsWith('/handler/') || pathname === '/oauth/callback';

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-bold text-red-600">Algo deu errado</h1>

        {isOAuthCallback ? (
          <p className="max-w-md text-gray-600">
            Ocorreu um erro durante a autenticação. Por favor, tente fazer login novamente.
          </p>
        ) : (
          <p className="max-w-md text-gray-600">
            Um erro inesperado ocorreu. Você pode recarregar a página ou tentar novamente.
          </p>
        )}

        {this.state.error && (
          <p className="max-w-md rounded bg-gray-100 p-3 font-mono text-sm text-gray-500">
            {this.state.error.message}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={this.handleReload}
            className="rounded bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700"
          >
            Recarregar página
          </button>
          <button
            onClick={this.handleSoftReset}
            className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }
}
