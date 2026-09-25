import type { ReactNode } from 'react';
import { GameButton, GameTitle, ResourceChip } from '../index';
import './screens.css';

/** Page composition only. Navigation and resources are supplied by the caller. */
export function GameScreen({ title, subtitle, coins, onBack, children, navigation, testId }: {
  title: string;
  subtitle?: string;
  coins: number;
  onBack?: () => void;
  children: ReactNode;
  navigation: ReactNode;
  testId?: string;
}) {
  return <section className="game-screen" data-testid={testId}>
    <div className="game-screen-toolbar">
      {onBack && <GameButton variant="wood" onClick={onBack} aria-label="返回餐厅">返回</GameButton>}
      <ResourceChip label="金币" value={coins} />
    </div>
    <div className="game-screen-content">
      <GameTitle level={1} subtitle={subtitle}>{title}</GameTitle>
      {children}
    </div>
    <div className="game-screen-navigation">{navigation}</div>
  </section>;
}
