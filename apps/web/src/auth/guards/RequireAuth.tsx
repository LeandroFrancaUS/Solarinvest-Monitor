'use client';

import React, { useEffect, useRef } from 'react';

/**
 * Returns true when the current pathname is an OAuth callback URL.
 * Evaluated BEFORE mounting any component that subscribes to auth state,
 * which prevents React error #426 ("Cannot update a component while
 * rendering a different component") during the OAuth code-exchange.
 */
export function isOAuthCallbackPath(pathname: string): boolean {
  return pathname.startsWith('/handler/') || pathname === '/oauth/callback';
}

// ---------------------------------------------------------------------------
// OAuthCallbackHandler
// Renders a loading screen while the SDK exchanges the OAuth code.
// A mountedRef guard ensures we never call setState after unmount, which
// would trigger a re-render of an already-unmounting tree.
// ---------------------------------------------------------------------------

interface OAuthCallbackHandlerProps {
  onComplete?: () => void;
}

function OAuthCallbackHandler({ onComplete }: OAuthCallbackHandlerProps) {
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const run = async () => {
      try {
        // Notify parent only while still mounted to prevent stale-closure
        // state updates that cause React error #426.
        if (mountedRef.current) {
          onComplete?.();
        }
      } catch (err) {
        if (mountedRef.current) {
          console.error('[OAuthCallbackHandler] error during callback:', err);
        }
      }
    };

    run();

    return () => {
      mountedRef.current = false;
    };
  }, [onComplete]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-gray-500">Autenticando…</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RequireAuth (exported)
// This is the OUTER guard. It checks isOAuthCallbackPath() BEFORE mounting
// RequireAuthWithStack (or any hook that subscribes to the auth context).
// This prevents the SDK from triggering auth-context re-renders mid-render.
// ---------------------------------------------------------------------------

interface RequireAuthProps {
  /** The pathname of the current page (e.g., from usePathname()). */
  pathname: string;
  /** Content to render when the user is authenticated. */
  children: React.ReactNode;
  /** Optional override for the loading/unauthenticated fallback. */
  fallback?: React.ReactNode;
}

export function RequireAuth({ pathname, children, fallback }: RequireAuthProps) {
  // If we are on an OAuth callback path, render the handler BEFORE any
  // component that calls useUser() is ever mounted.  This is the key fix:
  // RequireAuthWithStack (which subscribes to the auth context via useUser())
  // is never mounted during the OAuth code exchange, so the SDK's internal
  // context update cannot trigger error #426.
  if (isOAuthCallbackPath(pathname)) {
    return <OAuthCallbackHandler />;
  }

  return <RequireAuthWithStack fallback={fallback}>{children}</RequireAuthWithStack>;
}

// ---------------------------------------------------------------------------
// RequireAuthWithStack (internal)
// This component calls the auth hook (useUser / useCurrentUser).
// It is ONLY mounted when we are NOT on an OAuth callback path, so the
// auth-context subscription is stable and cannot cause error #426.
// ---------------------------------------------------------------------------

interface RequireAuthWithStackProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

function RequireAuthWithStack({ children, fallback }: RequireAuthWithStackProps) {
  // Replace this import with the actual auth hook when Stack Auth (or another
  // provider) is wired up.  The critical invariant is that this component is
  // never rendered during an OAuth callback, which is enforced by RequireAuth.
  //
  // Example:
  //   const { user, isLoading } = useUser();
  //
  // For now we render children directly (the app is pre-auth).
  return <>{children}</>;
}
