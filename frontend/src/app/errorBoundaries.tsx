import { Component, type ReactNode } from 'react';
import { ErrorScreen } from '@/components/ErrorScreen';
import { reloadPage } from './reloadPage';

// Parts of the app are files of their own, downloaded when first needed: the event's theme pack and the host
// screens. When one doesn't arrive, React throws while drawing. Without a boundary the page goes blank (or, inside
// the routes, the router shows its developer page with a stack trace). These two put `ErrorScreen` there instead.

interface AppErrorBoundaryProps {
  /** Replaced by tests; the app reloads the page. */
  onReload?: () => void;
  children: ReactNode;
}

interface AppErrorBoundaryState {
  failed: boolean;
}

/**
 * Around the whole app, for what fails outside the routes (the theme pack). A class because React only offers error
 * boundaries as class components; there is no hook for it.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  render(): ReactNode {
    return this.state.failed ? <ErrorScreen onReload={this.props.onReload ?? reloadPage} /> : this.props.children;
  }
}

/** A route's `ErrorBoundary`: shown in place of the routes below it when one of them throws while drawing. */
export function RouteErrorScreen() {
  return <ErrorScreen onReload={reloadPage} />;
}
