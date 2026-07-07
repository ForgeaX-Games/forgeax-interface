/**
 * Agent reply-language resolution.
 *
 * Two independent language concepts live in the app:
 *   - UI language  → i18n locale (SettingsPanel), controls the interface chrome.
 *   - reply language → what the AGENT is asked to answer in (this module).
 *
 * Per-turn precedence (highest first):
 *   1. followInput ON  → detected language of THIS user message
 *   2. otherwise        → the global `replyLanguage` (quick switcher value)
 *
 * The resolved language is sent to the server as a `replyLanguage` field; the
 * server injects a one-line directive into composeTurnRequest's `dynamicSuffix`
 * (a per-turn suffix, not the persona/charter cache prefix) so it reaches every
 * provider uniformly WITHOUT polluting the visible user message or its replay.
 */

import { useAppStore } from '../store';

export type ReplyLang = 'en' | 'zh';

/**
 * Heuristic language detection for a user message.
 * Counts CJK (Han / Hiragana / Katakana / Hangul) vs Latin letters. Chinese is
 * chosen when CJK is present and not clearly dominated by Latin text. Returns
 * null when there is no natural-language signal (pure punctuation / numbers /
 * code) so the caller can fall back to the configured language.
 */
export function detectInputLanguage(text: string): ReplyLang | null {
  const s = (text ?? '').trim();
  if (!s) return null;
  let cjk = 0;
  let latin = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (
      (c >= 0x4e00 && c <= 0x9fff) || // CJK Unified Ideographs
      (c >= 0x3040 && c <= 0x30ff) || // Hiragana + Katakana
      (c >= 0xac00 && c <= 0xd7af) // Hangul syllables
    ) {
      cjk++;
    } else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) {
      latin++;
    }
  }
  if (cjk === 0 && latin === 0) return null;
  // A little CJK goes a long way (CJK glyphs pack more meaning per char), so a
  // message counts as Chinese unless Latin clearly dominates.
  return cjk > 0 && cjk * 3 >= latin ? 'zh' : 'en';
}

/** Resolve the reply language for a turn given the raw user input. */
export function resolveReplyLanguage(userText: string): ReplyLang {
  const { followInput, replyLanguage } = useAppStore.getState();
  if (followInput) {
    const detected = detectInputLanguage(userText);
    if (detected) return detected;
  }
  return replyLanguage;
}
