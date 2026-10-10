import { faCheck, faLock, faLockOpen } from '@fortawesome/free-solid-svg-icons';
import type { MonsterProgress as Progress } from '../../domain/progression';

export const monsterProgressLabel: Record<Progress, string> = {
  locked: '未解锁', available: '已解锁', cleared: '已通关',
};

/** Dynamic state, independent of the baked status corner in the legacy card art. */
export function MonsterProgressBadge({ progress }: { progress: Progress }) {
  const icon = progress === 'cleared' ? faCheck : progress === 'available' ? faLockOpen : faLock;
  const [width, height, , , path] = icon.icon;
  return <span className={`monster-progress monster-progress--${progress}`} data-progress={progress} role="img" aria-label={monsterProgressLabel[progress]}>
    <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true"><path d={Array.isArray(path) ? path.join(' ') : path} fill="currentColor" /></svg>
  </span>;
}
