import {
  AlertRegular,
  CalendarRegular,
  GamesRegular,
  PeopleTeamRegular,
  SignOutRegular,
  TrophyRegular,
  type FluentIcon,
} from '@fluentui/react-icons';
import {
  Button,
  MessageBar,
  MessageBarBody,
  makeStyles,
  mergeClasses,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import type { NavItem, NavItemKey } from '@/domain/navigation';
import { appTokens } from '@/theme/appTokens';

export interface AppLayoutProps {
  eventName: string;
  /** The signed-in person's display name (never the real name). */
  displayName: string;
  navItems: readonly NavItem[];
  onSignOut: () => void;
  isSigningOut: boolean;
  /** Why signing out failed, when it did. */
  signOutError?: string;
  children: ReactNode;
}

const navIcons: Record<NavItemKey, FluentIcon> = {
  buzz: AlertRegular,
  host: GamesRegular,
  teams: PeopleTeamRegular,
  scores: TrophyRegular,
  event: CalendarRegular,
};

const tapTarget = '44px';

const useStyles = makeStyles({
  frame: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100dvh',
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    backgroundColor: appTokens.surfacePanel,
    ...shorthands.borderBottom(appTokens.borderWidth, appTokens.borderStyle, appTokens.surfacePanelBorder),
  },
  identity: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  eventName: {
    fontFamily: appTokens.fontHeading,
    fontSize: tokens.fontSizeBase400,
    lineHeight: tokens.lineHeightBase400,
  },
  person: {
    color: appTokens.textMuted,
  },
  signOut: {
    minHeight: tapTarget,
  },
  main: {
    flexGrow: 1,
    minWidth: 0,
    padding: tokens.spacingHorizontalM,
  },
  nav: {
    position: 'sticky',
    bottom: 0,
    backgroundColor: appTokens.surfacePanel,
    ...shorthands.borderTop(appTokens.borderWidth, appTokens.borderStyle, appTokens.surfacePanelBorder),
  },
  navList: {
    display: 'flex',
    margin: 0,
    padding: 0,
    listStyleType: 'none',
  },
  navItem: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  navLink: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalXXS,
    minHeight: '56px',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalXS}`,
    color: appTokens.textBody,
    textDecorationLine: 'none',
    ...shorthands.borderTop(tokens.strokeWidthThickest, 'solid', tokens.colorTransparentStroke),
    ':focus-visible': {
      outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '-3px',
    },
  },
  // The current screen is marked by a bar and bold text as well as colour, and by `aria-current` for screen readers.
  navLinkActive: {
    fontWeight: tokens.fontWeightBold,
    ...shorthands.borderTop(tokens.strokeWidthThickest, 'solid', tokens.colorBrandForeground1),
  },
  navLabel: {
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    overflowWrap: 'anywhere',
    textAlign: 'center',
  },
});

/**
 * The frame of every signed-in screen: who and where at the top, the page in the middle, and a bottom navigation
 * that stays within thumb reach. Presentational: what to show and what signing out does come from the view model.
 * Its links are router `NavLink`s so each destination is a real address (the back button works, a link can be shared).
 */
export const AppLayout = observer(function AppLayout({
  eventName,
  displayName,
  navItems,
  onSignOut,
  isSigningOut,
  signOutError,
  children,
}: AppLayoutProps) {
  const styles = useStyles();

  return (
    <div className={styles.frame}>
      <header className={styles.header}>
        <div className={styles.identity}>
          {eventName && <span className={styles.eventName}>{eventName}</span>}
          <span className={styles.person}>{displayName}</span>
        </div>
        <Button className={styles.signOut} icon={<SignOutRegular />} disabled={isSigningOut} onClick={onSignOut}>
          Sign out
        </Button>
      </header>
      {signOutError && (
        <MessageBar intent="error">
          <MessageBarBody>{signOutError}</MessageBarBody>
        </MessageBar>
      )}
      <main className={styles.main}>{children}</main>
      <nav className={styles.nav} aria-label="Main">
        <ul className={styles.navList}>
          {navItems.map((item) => {
            const Icon = navIcons[item.key];
            return (
              <li key={item.key} className={styles.navItem}>
                {/* `end`: "Host" at /admin must not also look current on /admin/scores. */}
                <NavLink
                  to={item.path}
                  end
                  className={({ isActive }) => mergeClasses(styles.navLink, isActive && styles.navLinkActive)}
                >
                  <Icon fontSize={24} aria-hidden />
                  <span className={styles.navLabel}>{item.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
});
