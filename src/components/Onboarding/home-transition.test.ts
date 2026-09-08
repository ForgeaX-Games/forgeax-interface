import { describe, expect, test } from 'bun:test';
import { resolveHomeOnboarding, shouldActivateTour } from './home-transition';
import type { OnboardingPersisted } from './types';

const fresh = (phase: OnboardingPersisted['phase'] = 'welcome'): OnboardingPersisted => ({
  v: 2,
  phase,
  done: { tour: false, firstChat: false },
});

describe('onboarding tour product policy', () => {
  test('suppresses the tour in memory when the product disables it', () => {
    expect(shouldActivateTour(false, fresh())).toBe(false);
    expect(shouldActivateTour(true, fresh())).toBe(true);
  });

  test('completes onboarding when the product-disabled tour is reached', () => {
    expect(resolveHomeOnboarding(fresh('project'), false)).toEqual({
      shouldRunTour: false,
      state: {
        v: 2,
        phase: 'done',
        done: { tour: true, firstChat: false },
      },
    });
  });

  test('keeps the normal shared tour path enabled', () => {
    expect(resolveHomeOnboarding(fresh('project'), true)).toEqual({
      shouldRunTour: true,
      state: {
        v: 2,
        phase: 'home',
        done: { tour: false, firstChat: false },
      },
    });
  });

  test('does not revive an already completed tour', () => {
    const state: OnboardingPersisted = {
      v: 2,
      phase: 'project',
      done: { tour: true, firstChat: true },
    };
    expect(resolveHomeOnboarding(state, true)).toEqual({
      shouldRunTour: false,
      state: {
        v: 2,
        phase: 'done',
        done: { tour: true, firstChat: true },
      },
    });
  });
});
