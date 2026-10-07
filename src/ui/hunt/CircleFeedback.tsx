import type { CombatFeedback } from '../../domain/combat';
import { bodyAnchorLabel } from '../../domain/v2';

/** Each circle keeps its own result, including a simultaneous success + Miss. */
export function CircleFeedback({events}:{events:CombatFeedback[]}){
  const circles=events.filter(event=>event.kind==='Nice'||event.kind==='Perfect'||event.kind==='Miss');
  return <div className="circle-feedback-list" role="status" aria-live="polite" aria-atomic="false">
    {circles.map(event=><div key={event.id} className={`circle-feedback circle-feedback--${event.kind}`} data-testid="circle-feedback" data-event-id={event.id} data-circle-id={event.circleId}>
      <strong>{event.kind==='Nice'?'GOOD':event.kind.toUpperCase()}</strong>
      <span>{event.anchorId?bodyAnchorLabel(event.anchorId):'招架'} · {event.pendingRound?'已判定':event.kind==='Miss'?'玩家受伤':'怪物受伤'}</span>
      {!event.pendingRound&&<b>−{event.amount}</b>}
    </div>)}
  </div>;
}
