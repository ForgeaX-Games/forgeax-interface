import { afterEach, describe, expect, it } from 'bun:test';
import { setLocale } from '@/i18n';
import { formatSessionTime } from './session-time';

const NOW = new Date(2026, 7, 17, 18, 30).getTime();

afterEach(() => setLocale('en', { persist: false }));

describe('formatSessionTime', () => {
  it('formats every branch in the Chinese design vocabulary', () => {
    setLocale('zh', { persist: false });
    expect(formatSessionTime(new Date(2026, 7, 17, 14, 20).getTime(), { now: NOW })).toBe('今天 14:20');
    expect(formatSessionTime(new Date(2026, 7, 16, 19, 41).getTime(), { now: NOW })).toBe('昨天 19:41');
    expect(formatSessionTime(new Date(2026, 7, 14, 10, 5).getTime(), { now: NOW })).toBe('周五 10:05');
    expect(formatSessionTime(new Date(2026, 6, 30, 8, 0).getTime(), { now: NOW })).toBe('7 月 30 日');
    expect(formatSessionTime(new Date(2025, 11, 5, 8, 0).getTime(), { now: NOW })).toBe('2025 年 12 月 5 日');
    expect(formatSessionTime(NOW + 1_000, { now: NOW })).toBe('刚刚');
  });

  it('formats English without leaking Chinese date grammar', () => {
    setLocale('en', { persist: false });
    expect(formatSessionTime(new Date(2026, 7, 17, 14, 20).getTime(), { now: NOW })).toBe('Today 14:20');
    expect(formatSessionTime(new Date(2026, 6, 30, 8, 0).getTime(), { now: NOW })).toBe('Jul 30');
    expect(formatSessionTime(new Date(2025, 11, 5, 8, 0).getTime(), { now: NOW })).toBe('Dec 5, 2025');
  });

  it('returns an empty label for missing or invalid timestamps', () => {
    expect(formatSessionTime(undefined, { now: NOW })).toBe('');
    expect(formatSessionTime(Number.NaN, { now: NOW })).toBe('');
  });
});
