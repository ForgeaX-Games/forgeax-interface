import { getLocale, t, type Locale, type TFunction } from '@/i18n';

interface SessionTimeOptions {
  now?: number;
  locale?: Locale;
  translate?: TFunction;
}

const DAY_MS = 86_400_000;

function calendarDayDiff(now: Date, then: Date): number {
  return Math.floor(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
      - Date.UTC(then.getFullYear(), then.getMonth(), then.getDate()))
    / DAY_MS,
  );
}

function clock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatSessionTime(
  timestamp: number | undefined,
  options: SessionTimeOptions = {},
): string {
  if (!timestamp || !Number.isFinite(timestamp)) return '';
  const nowMs = options.now ?? Date.now();
  const locale = options.locale ?? getLocale();
  const translate = options.translate ?? t;
  if (timestamp > nowMs) return translate('sessionTime.justNow');

  const now = new Date(nowMs);
  const then = new Date(timestamp);
  const dayDiff = calendarDayDiff(now, then);
  const time = clock(then);

  if (dayDiff <= 0) return translate('sessionTime.todayTime', { time });
  if (dayDiff === 1) return translate('sessionTime.yesterdayTime', { time });
  if (dayDiff < 7) {
    const weekday = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
      weekday: 'short',
    }).format(then);
    return translate('sessionTime.weekdayTime', { weekday, time });
  }

  const month = locale === 'zh'
    ? String(then.getMonth() + 1)
    : new Intl.DateTimeFormat('en-US', { month: 'short' }).format(then);
  const day = then.getDate();
  return then.getFullYear() === now.getFullYear()
    ? translate('sessionTime.dateThisYear', { month, day })
    : translate('sessionTime.dateOtherYear', { year: then.getFullYear(), month, day });
}
