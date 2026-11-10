import { Button, MessageBar, MessageBarBody, makeStyles, tokens } from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import { Navigate, Outlet } from 'react-router';
import type { RouteAccess } from '@/domain/routeAccess';
import { ThemeSplash } from '@/theme/ThemeRoot';
import { RouteGuardViewModel } from './RouteGuardViewModel';
import { useViewModel } from './useViewModel';

const useStyles = makeStyles({
  unreachable: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalL,
  },
  retry: {
    minHeight: '44px',
  },
});

/**
 * A route that lets a person through, sends them elsewhere, or waits: the decision is the view model's. Used as the
 * `Component` of a route with child routes, so the children appear at the `<Outlet />` only for people allowed in.
 */
const RouteGuard = observer(function RouteGuard({ access }: { access: RouteAccess }) {
  const vm = useViewModel((services) => new RouteGuardViewModel(services.session, access));
  const styles = useStyles();
  const { decision } = vm;

  if (decision.kind === 'redirect') {
    // `replace`: the page the person was turned away from doesn't stay in the history for the back button.
    return <Navigate to={decision.to} replace />;
  }
  if (decision.kind === 'allow') {
    return <Outlet />;
  }
  if (vm.unreachableMessage !== undefined) {
    return (
      <main className={styles.unreachable}>
        <MessageBar intent="error">
          <MessageBarBody>{vm.unreachableMessage}</MessageBarBody>
        </MessageBar>
        <Button className={styles.retry} appearance="primary" disabled={vm.isRetrying} onClick={vm.retry}>
          Try again
        </Button>
      </main>
    );
  }
  // Never the join page while the session is still unknown: a signed-in person would see it flash.
  return <ThemeSplash />;
});

// One component per kind of route, so the route table needs no JSX and no props.
export const AnonymousOnlyGuard = () => <RouteGuard access="anonymousOnly" />;
export const SignedInGuard = () => <RouteGuard access="signedIn" />;
export const PlayerGuard = () => <RouteGuard access="player" />;
export const AdminGuard = () => <RouteGuard access="admin" />;
/** For `/` and any address the app doesn't have: everyone is sent to their own start page. */
export const StartRedirect = () => <RouteGuard access="start" />;
