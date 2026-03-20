'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface User {
  signOut: () => Promise<void>;
}

interface AppRoutesProps {
  user: User;
  onLogout: () => void;
}

/**
 * AppRoutes renders the full authenticated application shell.
 * It is conditionally rendered only when `isLoggingOut` is false,
 * which prevents the entire component tree from triggering cascading
 * re-renders (React error #426) during the logout transition.
 */
function AppRoutes({ user, onLogout }: AppRoutesProps) {
  return (
    <div>
      {/* Replace with actual application routing/shell */}
      <button onClick={onLogout}>Sair</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

interface AppProps {
  /** The authenticated user provided by the auth provider. */
  user: User | null;
}

/**
 * App — root application component.
 *
 * ## React error #426 fix (logout path)
 *
 * After `user.signOut()` the auth SDK sets the user context to `null`.
 * If `<AppRoutes>` (and all its children) are still mounted during this
 * transition they trigger cascading re-renders that produce error #426.
 *
 * The fix:
 *   1. `isLoggingOut` state is set to `true` BEFORE calling `signOut()`.
 *   2. While `isLoggingOut` is true, only a minimal "Saindo…" screen is
 *      rendered — `<AppRoutes>` is fully unmounted.
 *   3. `handleLogout` is stabilised with `isLoggingOutRef` + `userRef` and
 *      an empty dependency array so its identity is stable across renders.
 */
export default function App({ user }: AppProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Refs keep the latest values accessible inside the stable callback
  // without re-creating it on every render.
  const isLoggingOutRef = useRef(isLoggingOut);
  const userRef = useRef(user);

  useEffect(() => {
    isLoggingOutRef.current = isLoggingOut;
  }, [isLoggingOut]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Stable callback — empty dependency array is intentional.
  // We read latest values from refs to avoid stale closures while
  // guaranteeing this function reference never changes, which prevents
  // unnecessary re-renders of deep children that receive it as a prop.
  const handleLogout = useCallback(async () => {
    if (isLoggingOutRef.current) return;

    setIsLoggingOut(true);

    try {
      await userRef.current?.signOut();
    } catch (err) {
      console.error('[App] signOut error:', err);
      // Even on error we stay in "logged out" state — reset to let the
      // auth provider redirect to the login page.
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Render a minimal screen while the logout is in progress.
  // <AppRoutes> is NOT rendered, so none of its children can trigger
  // auth-context re-renders during the SDK's user → null transition.
  if (isLoggingOut) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Saindo…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Carregando…</p>
      </div>
    );
  }

  return <AppRoutes user={user} onLogout={handleLogout} />;
}
