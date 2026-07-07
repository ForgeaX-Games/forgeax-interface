/**
 * Language settings section body — rendered inside the SettingsPanel "System"
 * group. Two independent language concepts live here:
 *
 *   - Interface language → i18n locale. Controls the UI chrome. English is the
 *     source of truth; every other language is a translation overlay.
 *   - Agent reply language → what the AGENT is asked to answer in. Either
 *     follows each user message ("follow my input", default) or is pinned to a
 *     fixed language. See lib/reply-language.ts.
 *
 * Registered from SectionsRegister.tsx via useSettingsSection({ id: 'language' }).
 */

import { Globe } from 'lucide-react';
import { Section } from '../components/TopBar/SettingsDrawer';
import { Checkbox } from '../components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { useAppStore } from '../store';
import {
  SUPPORTED_LOCALES,
  useTranslation,
  type Locale,
} from './index';

export function LanguageSection() {
  const { t, i18n } = useTranslation();
  const replyLanguage = useAppStore((s) => s.replyLanguage);
  const followInput = useAppStore((s) => s.followInput);
  const setFollowInput = useAppStore((s) => s.setFollowInput);
  const pinReplyLanguage = useAppStore((s) => s.pinReplyLanguage);

  return (
    <Section icon={<Globe size={14} />} title={t('settings.language.label')} hint={t('settings.language.description')}>
      <Select
        value={i18n.language}
        onValueChange={(v) => i18n.changeLanguage(v as Locale)}
      >
        <SelectTrigger
          className="w-[220px]"
          aria-label={t('settings.language.selectAria')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SUPPORTED_LOCALES.map((l) => (
            <SelectItem key={l.code} value={l.code}>
              {l.nativeLabel}
              {l.nativeLabel !== l.label ? ` · ${l.label}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="mt-5 border-t border-border/60 pt-4">
        <div className="text-sm font-medium text-foreground">
          {t('settings.language.agentLabel')}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {t('settings.language.agentDescription')}
        </div>

        <label className="mt-3 flex items-start gap-2.5 cursor-pointer">
          <Checkbox
            checked={followInput}
            onCheckedChange={(v) => setFollowInput(v === true)}
            className="mt-0.5"
          />
          <span>
            <span className="block text-sm text-foreground">{t('lang.followInput')}</span>
            <span className="block text-xs text-muted-foreground">{t('lang.followInputDesc')}</span>
          </span>
        </label>

        <div className="mt-3">
          <div className="text-xs text-muted-foreground mb-1.5">
            {t('settings.language.replyFixedLabel')}
          </div>
          <Select
            value={replyLanguage}
            onValueChange={(v) => pinReplyLanguage(v as 'en' | 'zh')}
          >
            <SelectTrigger
              className="w-[220px]"
              aria-label={t('settings.language.replySelectAria')}
              disabled={followInput}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="zh">中文</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </Section>
  );
}
