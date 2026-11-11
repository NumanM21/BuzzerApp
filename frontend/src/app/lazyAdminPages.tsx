import { Spinner } from '@fluentui/react-components';
import { lazy, Suspense } from 'react';

// The host screens are for admins only, so a player's phone never needs their code: each is its own file that is
// fetched the first time an admin opens it. The shell (header and navigation) stays on screen while it loads,
// which is why this is `React.lazy` inside the page and not a lazy route (a lazy route would blank the whole app
// until the file arrived).
const AdminPage = lazy(async () => ({ default: (await import('@/features/admin/AdminPage')).AdminPage }));
const AdminScoresPage = lazy(async () => ({ default: (await import('@/features/admin/AdminScoresPage')).AdminScoresPage }));
const AdminEventPage = lazy(async () => ({ default: (await import('@/features/admin/AdminEventPage')).AdminEventPage }));

function Loading() {
  return <Spinner label="Loading" />;
}

export function LazyAdminPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AdminPage />
    </Suspense>
  );
}

export function LazyAdminScoresPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AdminScoresPage />
    </Suspense>
  );
}

export function LazyAdminEventPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AdminEventPage />
    </Suspense>
  );
}
