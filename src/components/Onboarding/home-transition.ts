import type { OnboardingPersisted } from './types';

export interface HomeOnboardingTransition {
  shouldRunTour: boolean;
  state: OnboardingPersisted;
}

/** Product policy and persisted progress jointly decide whether the shell tour mounts. */
export function shouldActivateTour(tourEnabled: boolean, state: OnboardingPersisted): boolean {
  return tourEnabled && !state.done.tour;
}

/** Resolve setup → shell without parking a disabled/completed tour in `home`. */
export function resolveHomeOnboarding(
  state: OnboardingPersisted,
  tourEnabled: boolean,
): HomeOnboardingTransition {
  const shouldRunTour = shouldActivateTour(tourEnabled, state);
  if (shouldRunTour) return { shouldRunTour, state: { ...state, phase: 'home' } };
  if (state.phase === 'done' && state.done.tour) return { shouldRunTour, state };
  return {
    shouldRunTour,
    state: {
      ...state,
      phase: 'done',
      done: { ...state.done, tour: true },
    },
  };
}
