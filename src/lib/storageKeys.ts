// Storage key registry — the single place every localStorage key the interface
// owns is declared (architecture review §D). Before this, ~17 `forgeax:*` keys
// with ad-hoc versions (v1/v2/v4/v5) were scattered across modules with no map,
// making migrations easy to miss and collisions easy to introduce.
//
// RULE: never inline a `'forgeax…'` localStorage key string in a component.
// Add it here (with a one-line purpose + version note) and import the const.
//
// Versioning: when a value's SHAPE changes incompatibly, bump its key suffix
// (…:v2 → …:v3) and add a migration. The dockview layout uses a separate
// numeric stamp (LAYOUT_VERSION) handled by the page workspace migrator.

export const STORAGE_KEYS = {
  // ── session / chat shell (store.ts) ──
  /** persisted open chat tabs. */
  tabs: 'forgeax.tabs',
  /** active session id. */
  activeSid: 'forgeax.activeSid',
  /** active tab id. */
  activeTabId: 'forgeax.activeTabId',
  /** first-run boot splash seen flag. */
  bootSplash: 'forgeax.boot.splash.v1',
  /** first-run onboarding state machine (welcome→project→home). Shape:
   *  OnboardingPersisted (see components/Onboarding/types). v2 supersedes the
   *  legacy boolean `onboardingSeenLegacy`, which is read once to migrate. */
  onboarding: 'forgeax.onboarding.v2',
  /** legacy boolean "onboarding dismissed" flag (pre state-machine) — read once
   *  to migrate existing users past the first-run wizard, then ignored. */
  onboardingSeenLegacy: 'forgeax.onboarding.seen',

  // ── i18n ──
  /** active UI language code ('en' | 'zh' | …). English is the default/source. */
  locale: 'forgeax.locale',

  // ── model routing ──
  /** persistent cli provider override (store.ts). null → native forgeax path. */
  providerOverride: 'forgeax.providerOverride',
  /** { [providerKey]: modelId } — last model the user HAND-PICKED per provider
   *  (providerKey = cli-id | 'forgeax'). New sessions seed from this so the
   *  picker lands on "where I left off"; a provider SWITCH still resets to the
   *  provider default. See lib/model-prefs.ts. */
  lastModelByProvider: 'forgeax.lastModel.byProvider.v1',

  // ── reply language ──
  /** agent chat reply language ('en' | 'zh'). Global, decoupled from UI locale.
   *  Default 'en'. Overridden per-turn by followInput when that is enabled. */
  replyLanguage: 'forgeax.replyLanguage',
  /** when '1', the agent reply language follows the detected language of each
   *  user message (highest priority). Default enabled ('1'). */
  followInput: 'forgeax.followInput',

  // ── publish module ──
  /** when '1', the first-run Publish coach-mark has been seen (or skipped). */
  publishOnboarded: 'forgeax.publish.onboarded',

  /** Contact email reused by the manual feedback form. Plain string, v1. */
  feedbackEmail: 'forgeax.feedback.email.v1',
  /** Compatibility fallback for the durable IndexedDB feedback outbox. */
  feedbackPendingSubmissions: 'forgeax.feedback.pending-submissions.v1',

  // ── activity rail ──
  /** [v3] qualified activity IDs pinned to the ActivityRail.
   *  Shape: string[]. Display order keeps the historical curated entries first,
   *  then follows ActivityRegistry order for newly pinned extensions;
   *  missing key → the historical 12-plugin product seed is derived. */
  activityRailPinned: 'forgeax.activityRail.pinned.v3',
  /** one-shot migration marker: add the Video Game entry to existing v3 pins
   *  once without re-pinning it after a deliberate user unpin. */
  activityRailPinnedVideoGameDefault: 'forgeax.activityRail.pinned.videoGameDefault.v1',
  /** [ABANDONED, v2] briefly seeded every registered activity; intentionally not migrated. */
  activityRailPinnedLegacyV2: 'forgeax.activityRail.pinned.v2',
  /** [LEGACY, v1] plugin slugs (or early qualified IDs); read-only migration source. */
  activityRailPinnedLegacyV1: 'forgeax.activityRail.pinned.v1',
} as const;

// Cross-component window CustomEvent names (NOT storage, but same "stringly-typed
// global namespace" footgun — centralized here so they can't drift either).
export const APP_EVENTS = {
  dockLayoutToggle: 'forgeax:shell:dock-layout-toggle',
  dockReset: 'forgeax:shell:dock-reset',
  animHandoff: 'forgeax:anim-handoff',
  /** Viewport run axis changed. detail: { running: boolean }. */
  viewportRunChanged: 'forgeax:viewport-run-changed',
  /** Open (or focus, if already open) a dock panel by id. detail: { id: string } */
  openPanel: 'forgeax:shell:open-panel',
  /** Focus a dock panel by id ONLY if it already exists (no reopen / no force-insert). detail: { id: string } */
  focusPanel: 'forgeax:shell:focus-panel',
  /** Chat composer intercepted a send with no model path — open the connect
   *  prompt. detail: { text?: string } (the pending message, echoed back on
   *  resume so the composer can re-send it after the user connects). */
  openConnectPrompt: 'forgeax:open-connect-prompt',
  /** Connect prompt resolved with a usable model path — the composer that
   *  opened it should re-send the pending message. detail: { text?: string } */
  resumeSend: 'forgeax:resume-send',
  /** Onboarding milestones changed in the SAME session (tour finished, first
   *  chat done) — lets the chat empty-state hint react without a reload, since
   *  it can't re-read localStorage on its own. No detail. */
  onboardingChanged: 'forgeax:onboarding-changed',
} as const;
