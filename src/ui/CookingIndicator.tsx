import { useEffect, useState } from 'react';
import { useGame, type Screen } from '../store';
import { ItemIcon } from './index';

export const canShowCookingIndicator = (screen: Screen) => !['kitchen', 'battle', 'result', 'stages'].includes(screen);

/** A read-only reminder, kept off the monster roster and battle controls. */
export function CookingIndicator() {
  const job = useGame(state => state.save.cookingJob);
  const screen = useGame(state => state.screen);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!job) return;
    const refresh = () => setNow(Date.now());
    refresh();
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [job?.id]);
  if (!job || !canShowCookingIndicator(screen)) return null;
  const seconds = Math.max(0, Math.ceil((job.finishAt - now) / 1000));
  return <button className="cooking-status" type="button" data-testid="cooking-status" onClick={() => useGame.getState().go('kitchen')}>
    <ItemIcon name="pot" size={26} /><span>{seconds ? `烹饪中 · ${seconds}秒` : '料理完成 · 去领取'}</span>
  </button>;
}
