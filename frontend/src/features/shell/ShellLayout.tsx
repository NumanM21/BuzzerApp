import { observer } from 'mobx-react-lite';
import { Outlet } from 'react-router';
import { useViewModel } from '@/app/useViewModel';
import { AppLayout } from '@/components/AppLayout';
import { ShellViewModel } from './ShellViewModel';

/** The route that wraps every signed-in screen in the header and bottom navigation. */
export const ShellLayout = observer(function ShellLayout() {
  const vm = useViewModel((services) => new ShellViewModel(services.event, services.session));

  return (
    <AppLayout
      eventName={vm.eventName}
      displayName={vm.displayName}
      navItems={vm.navItems}
      onSignOut={vm.signOut}
      isSigningOut={vm.isSigningOut}
      signOutError={vm.signOutError}
    >
      <Outlet />
    </AppLayout>
  );
});
