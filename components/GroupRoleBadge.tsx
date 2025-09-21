import React from 'react';
import { GroupRole } from '../types';
import Icon from './Icon';

interface GroupRoleBadgeProps {
  role: GroupRole;
}

const roleStyles: Record<GroupRole, { bg: string; text: string; icon?: React.ComponentProps<typeof Icon>['name'] }> = {
  'Admin': { bg: 'bg-rose-500/20', text: 'text-rose-400' },
  'Moderator': { bg: 'bg-sky-500/20', text: 'text-sky-400' },
  'Top Contributor': { bg: 'bg-amber-500/20', text: 'text-amber-400' },
};

const GroupRoleBadge: React.FC<GroupRoleBadgeProps> = ({ role }) => {
  const styles = roleStyles[role];

  return (
    <span className={`ml-2 px-2 py-0.5 text-xs font-semibold rounded-full ${styles.bg} ${styles.text} inline-flex items-center gap-1`}>
      {styles.icon && <Icon name={styles.icon} className="w-3 h-3" />}
      {role}
    </span>
  );
};

export default GroupRoleBadge;
