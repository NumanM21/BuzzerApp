import { makeStyles, shorthands, tokens } from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import { useId, type ReactNode } from 'react';
import { appTokens } from '@/theme/appTokens';
import { useTeamVisual } from '@/theme/useTeamVisual';
import { useCopy } from '@/theme/useThemePack';

export interface TeamCardMember {
  id: number;
  displayName: string;
  /** Shown in smaller text when present (admins, and a player's own row). */
  realName?: string | null;
  /** Marks the row of the person looking at the screen. */
  isViewer?: boolean;
}

export interface TeamCardProps {
  name: string;
  colorKey: string;
  iconKey: string;
  members: readonly TeamCardMember[];
  /** Slot at the top right of the card, for example the admin's ⋮ menu (F6). */
  action?: ReactNode;
  /** Slot at the end of each member row, for example "edit names" (F6). */
  renderMemberAction?: (member: TeamCardMember) => ReactNode;
}

// The 2026 icons are tiles with a 1.26:1 aspect ratio; other packs' icons are cropped to the same box.
const iconWidth = '63px';
const iconHeight = '50px';

const useStyles = makeStyles({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    minWidth: 0,
    padding: tokens.spacingHorizontalM,
    backgroundColor: appTokens.surfacePanel,
    ...shorthands.border(appTokens.borderWidth, appTokens.borderStyle, 'var(--team-fill)'),
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: appTokens.shadow,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalM,
  },
  iconBox: {
    flexShrink: 0,
    width: iconWidth,
    height: iconHeight,
    backgroundColor: 'var(--team-fill)',
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
  },
  icon: {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  name: {
    flexGrow: 1,
    minWidth: 0,
    margin: 0,
    alignSelf: 'center',
    fontFamily: appTokens.fontHeading,
    fontSize: tokens.fontSizeBase500,
    lineHeight: tokens.lineHeightBase500,
    // The longest team name must wrap rather than be clipped or push the card wider than a phone.
    overflowWrap: 'anywhere',
  },
  members: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    margin: 0,
    padding: 0,
    listStyleType: 'none',
  },
  member: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    minHeight: '44px',
  },
  memberNames: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  realName: {
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    color: appTokens.textMuted,
  },
  viewerMarker: {
    fontWeight: tokens.fontWeightSemibold,
  },
  empty: {
    margin: 0,
    color: appTokens.textMuted,
  },
});

/** One team: colour border, icon, name and members. Shared by the teams screen, the leaderboard and the archive. */
export const TeamCard = observer(function TeamCard({
  name,
  colorKey,
  iconKey,
  members,
  action,
  renderMemberAction,
}: TeamCardProps) {
  const styles = useStyles();
  const copy = useCopy();
  const visual = useTeamVisual(colorKey, iconKey);
  const headingId = useId();

  return (
    <section className={styles.card} aria-labelledby={headingId} style={{ '--team-fill': visual.fill }}>
      <div className={styles.header}>
        <div className={styles.iconBox}>
          {/* Decorative: the team name next to it says which team this is. */}
          <img className={styles.icon} src={visual.iconUrl} alt="" />
        </div>
        <h3 id={headingId} className={styles.name}>
          {name}
        </h3>
        {action}
      </div>
      {members.length === 0 ? (
        <p className={styles.empty}>{copy.teamNoMembers}</p>
      ) : (
        <ul className={styles.members}>
          {members.map((member) => (
            <li key={member.id} className={styles.member}>
              <span className={styles.memberNames}>
                <span>
                  {member.displayName}
                  {member.isViewer && <span className={styles.viewerMarker}> ({copy.teamYou})</span>}
                </span>
                {member.realName && <span className={styles.realName}>{member.realName}</span>}
              </span>
              {renderMemberAction?.(member)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});
