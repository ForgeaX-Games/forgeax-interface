import { describe, expect, it } from 'bun:test';
import {
  createChatDockAnimationController,
  prepareClosedChatOpen,
  type ChatDockAnimationPhase,
} from './chatDockAnimation';

function manualScheduler() {
  let nextId = 1;
  const pending = new Map<number, () => void>();
  return {
    scheduler: {
      setTimeout(callback: () => void): unknown {
        const id = nextId++;
        pending.set(id, callback);
        return id;
      },
      clearTimeout(handle: unknown): void {
        pending.delete(handle as number);
      },
    },
    runAll(): void {
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((callback) => callback());
    },
  };
}

describe('ChatDock animation controller', () => {
  it('prepares a closed F1 target at zero width before uncollapsing the store', () => {
    const calls: string[] = [];

    prepareClosedChatOpen(
      { atHome: false, collapsed: true },
      {
        moveHome: () => calls.push('move-home'),
        markForReopen: () => calls.push('mark-for-reopen'),
        prepareExpand: () => calls.push('prepare-zero-width'),
        uncollapse: () => calls.push('uncollapse-store'),
      },
    );

    expect(calls).toEqual([
      'move-home',
      'mark-for-reopen',
      'prepare-zero-width',
      'uncollapse-store',
    ]);
  });

  it('does not close until the collapse transition settles', () => {
    const timer = manualScheduler();
    const phases: ChatDockAnimationPhase[] = [];
    let closes = 0;
    const controller = createChatDockAnimationController({
      onPhaseChange: (phase) => phases.push(phase),
      shouldFinishCollapse: () => true,
      onCollapse: () => { closes += 1; },
    }, timer.scheduler);

    controller.collapse();
    expect(closes).toBe(0);
    expect(controller.getPhase()).toBe('collapsing');

    timer.runAll();
    expect(closes).toBe(1);
    expect(controller.getPhase()).toBe('idle');
    expect(phases).toEqual(['collapsing', 'idle']);
  });

  it('cancels a pending close when collapse reverses to expand', () => {
    const timer = manualScheduler();
    let closes = 0;
    const controller = createChatDockAnimationController({
      onPhaseChange: () => {},
      shouldFinishCollapse: () => true,
      onCollapse: () => { closes += 1; },
    }, timer.scheduler);

    controller.collapse();
    controller.startExpand();
    timer.runAll();

    expect(closes).toBe(0);
    expect(controller.getPhase()).toBe('idle');
  });

  it('rechecks the store state before a timeout closes the panel', () => {
    const timer = manualScheduler();
    let collapsed = true;
    let closes = 0;
    const controller = createChatDockAnimationController({
      onPhaseChange: () => {},
      shouldFinishCollapse: () => collapsed,
      onCollapse: () => { closes += 1; },
    }, timer.scheduler);

    controller.collapse();
    collapsed = false;
    timer.runAll();

    expect(closes).toBe(0);
    expect(controller.getPhase()).toBe('idle');
  });

  it('makes transitionend and fallback completion idempotent', () => {
    const timer = manualScheduler();
    let closes = 0;
    const controller = createChatDockAnimationController({
      onPhaseChange: () => {},
      shouldFinishCollapse: () => true,
      onCollapse: () => { closes += 1; },
    }, timer.scheduler);

    controller.collapse();
    controller.transitionEnd();
    timer.runAll();

    expect(closes).toBe(1);
    expect(controller.getPhase()).toBe('idle');
  });

  it('can reactivate after a Strict Mode effect cleanup', () => {
    const timer = manualScheduler();
    let closes = 0;
    const controller = createChatDockAnimationController({
      onPhaseChange: () => {},
      shouldFinishCollapse: () => true,
      onCollapse: () => { closes += 1; },
    }, timer.scheduler);

    controller.dispose();
    controller.activate();
    controller.collapse();
    timer.runAll();

    expect(closes).toBe(1);
    expect(controller.getPhase()).toBe('idle');
  });
});
