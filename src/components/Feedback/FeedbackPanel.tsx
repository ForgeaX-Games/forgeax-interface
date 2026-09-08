/**
 * FeedbackPanel — 「写反馈 / 我的反馈」两页签面板。
 *
 * 视觉 SSOT: docs/features/feedback-prototype/img04.png(写反馈)、
 * img06.png(截图缩略图)、img07.png(提交成功)、img08.png(我的反馈)。
 */

import { useRef, useState } from 'react';
import {
  Camera,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Megaphone,
  MessageCircle,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useTranslation } from '@/i18n';
import type { FeedbackReport, FeedbackType } from '@forgeax/types/feedback';
import { captureUiScreenshot } from '../../lib/ui-screenshot';
import { useFeedbackStore } from './store';
import './FeedbackPanel.css';

const TYPE_KEYS: FeedbackType[] = ['stuck', 'wrong', 'slow', 'ui', 'idea', 'other'];

function FeedbackHeader() {
  const { t } = useTranslation();
  const s = useFeedbackStore();

  return (
    <header className="feedback-header">
      <div className="feedback-header__brand">
        <span className="feedback-header__icon" aria-hidden="true">
          <Megaphone size={16} strokeWidth={2.25} />
        </span>
        <DialogTitle className="feedback-header__title">{t('feedback.panel.title')}</DialogTitle>
      </div>

      <div className="feedback-header__actions">
        <button
          type="button"
          className={`feedback-tab${s.tab === 'write' ? ' is-active' : ''}`}
          onClick={() => s.setTab('write')}
        >
          {t('feedback.panel.write')}
        </button>
        <button
          type="button"
          className={`feedback-tab${s.tab === 'mine' ? ' is-active' : ''}`}
          onClick={() => s.setTab('mine')}
        >
          {t('feedback.panel.mine')}
          {s.reports.length > 0 && <span className="feedback-tab__count">{s.reports.length}</span>}
        </button>
        <button
          type="button"
          className="feedback-header__close"
          aria-label={t('common.close')}
          title={t('common.close')}
          onClick={() => s.closePanel()}
        >
          <X size={15} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}

function WriteTab() {
  const { t } = useTranslation();
  const s = useFeedbackStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const hasSnapshot = s.screenshots.some((shot) => shot.kind === 'snapshot');

  const openPreview = (url: string) => {
    setPreviewScale(1);
    setPreviewUrl(url);
  };

  const closePreview = () => {
    setPreviewUrl(null);
    setPreviewScale(1);
  };

  const addSnapshot = async () => {
    const shot = await captureUiScreenshot({ target: 'app' });
    if ((shot as { captured?: boolean }).captured === false) return;
    const ok = shot as { dataUrl?: string };
    if (ok.dataUrl) s.addScreenshot({ previewUrl: ok.dataUrl, ref: ok.dataUrl, kind: 'snapshot' });
  };

  const onUpload = (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result ?? '');
        if (url) s.addScreenshot({ previewUrl: url, ref: url, kind: 'upload' });
      };
      reader.readAsDataURL(file);
    }
  };

  if (s.lastSubmitted) return <SuccessView />;

  return (
    <section className="feedback-write">
      <div className="feedback-form">
        <fieldset className="feedback-fieldset">
          <legend className="feedback-label">{t('feedback.form.type')}</legend>
          <div className="feedback-types">
            {TYPE_KEYS.map((type) => (
              <button
                key={type}
                type="button"
                className={`feedback-type${s.type === type ? ' is-active' : ''}`}
                onClick={() => s.setType(type)}
              >
                {t(`feedback.types.${type}`)}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="feedback-field">
          <span className="feedback-label">
            {t('feedback.form.description')}
            <span className="feedback-required">*</span>
          </span>
          <textarea
            value={s.description}
            onChange={(event) => s.setDescription(event.target.value)}
            placeholder={t('feedback.form.descriptionPh')}
            className="feedback-textarea"
          />
        </label>

        <div className="feedback-field">
          <span className="feedback-label feedback-label--muted">
            {t('feedback.form.screenshots')}
            <span>{t('feedback.form.screenshotLimit')}</span>
          </span>
          <div className="feedback-shots">
            {s.screenshots.map((shot, index) => (
              <div key={`${shot.kind}-${index}`} className="feedback-shot">
                <button
                  type="button"
                  className="feedback-shot__preview"
                  aria-label={t('feedback.form.previewScreenshot')}
                  title={t('feedback.form.previewScreenshot')}
                  onClick={() => openPreview(shot.previewUrl)}
                >
                  <img src={shot.previewUrl} alt="" />
                  <span className="feedback-shot__zoom" aria-hidden="true">
                    <ZoomIn size={18} strokeWidth={2} />
                  </span>
                </button>
                <button
                  type="button"
                  className="feedback-shot__remove"
                  aria-label={t('feedback.form.removeScreenshot')}
                  title={t('feedback.form.removeScreenshot')}
                  onClick={() => s.removeScreenshot(index)}
                >
                  <X size={14} strokeWidth={2.4} />
                </button>
              </div>
            ))}

            {!hasSnapshot && s.screenshots.length < 5 && (
              <button
                type="button"
                className="feedback-shot feedback-shot--action"
                aria-label={t('feedback.form.snapshot')}
                title={t('feedback.form.snapshot')}
                onClick={() => void addSnapshot()}
              >
                <Camera size={20} strokeWidth={1.8} />
              </button>
            )}

            {s.screenshots.length < 5 && (
              <button
                type="button"
                className="feedback-shot feedback-shot--action feedback-shot--add"
                aria-label={t('feedback.form.upload')}
                title={t('feedback.form.upload')}
                onClick={() => fileRef.current?.click()}
              >
                <span aria-hidden="true">+</span>
              </button>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => {
                onUpload(event.target.files);
                event.target.value = '';
              }}
            />
          </div>
        </div>

        <Dialog open={previewUrl !== null} onOpenChange={(open) => !open && closePreview()}>
          <DialogContent hideClose className="feedback-preview-dialog">
            <DialogTitle className="sr-only">{t('feedback.form.previewScreenshot')}</DialogTitle>
            <div className="feedback-preview__toolbar">
              <button
                type="button"
                aria-label={t('feedback.form.zoomOut')}
                title={t('feedback.form.zoomOut')}
                disabled={previewScale <= 1}
                onClick={() => setPreviewScale((scale) => Math.max(1, scale - 0.5))}
              >
                <ZoomOut size={17} strokeWidth={2} />
              </button>
              <span>{Math.round(previewScale * 100)}%</span>
              <button
                type="button"
                aria-label={t('feedback.form.zoomIn')}
                title={t('feedback.form.zoomIn')}
                disabled={previewScale >= 3}
                onClick={() => setPreviewScale((scale) => Math.min(3, scale + 0.5))}
              >
                <ZoomIn size={17} strokeWidth={2} />
              </button>
              <button
                type="button"
                aria-label={t('feedback.form.resetZoom')}
                title={t('feedback.form.resetZoom')}
                disabled={previewScale === 1}
                onClick={() => setPreviewScale(1)}
              >
                <RotateCcw size={16} strokeWidth={2} />
              </button>
            </div>
            <div className="feedback-preview__viewport">
              <div
                className="feedback-preview__stage"
                style={{ width: `${previewScale * 100}%`, height: `${previewScale * 100}%` }}
              >
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt={t('feedback.form.previewScreenshot')}
                    style={{
                      maxWidth: `${100 / previewScale}%`,
                      maxHeight: `${100 / previewScale}%`,
                      transform: `scale(${previewScale})`,
                    }}
                  />
                )}
              </div>
            </div>
            <button
              type="button"
              className="feedback-preview__close"
              aria-label={t('common.close')}
              title={t('common.close')}
              onClick={closePreview}
            >
              <X size={18} strokeWidth={2} />
            </button>
          </DialogContent>
        </Dialog>

        <label className="feedback-field">
          <span className="feedback-label">
            {t('feedback.form.email')}
            <span className="feedback-required">*</span>
          </span>
          <input
            type="email"
            required
            value={s.email}
            onChange={(event) => s.setEmail(event.target.value)}
            placeholder={t('feedback.form.emailPh')}
            className="feedback-input"
          />
        </label>

        {s.submitError && !['description-required', 'email-required'].includes(s.submitError) && (
          <p className="feedback-error">{s.submitError}</p>
        )}
      </div>

      <footer className="feedback-footer">
        <button type="button" className="feedback-button feedback-button--secondary" onClick={() => s.closePanel()}>
          {t('feedback.form.cancel')}
        </button>
        <button
          type="button"
          className="feedback-button feedback-button--primary"
          disabled={!s.description.trim() || !s.email.trim() || s.submitting}
          onClick={() => void s.submit()}
        >
          {s.submitting && <Loader2 size={14} className="feedback-spinner" />}
          {t('feedback.form.submit')}
        </button>
      </footer>
    </section>
  );
}

function SuccessView() {
  const { t } = useTranslation();
  const s = useFeedbackStore();
  if (!s.lastSubmitted) return null;

  return (
    <section className="feedback-success">
      <div className="feedback-success__body">
        <div className="feedback-success__mark" aria-hidden="true">
          <Check size={32} strokeWidth={2.5} />
        </div>
        <h3>{t('feedback.success.title')}</h3>
        <p className="feedback-success__subtitle">{t('feedback.success.body')}</p>

        <div className="feedback-success__receipt">
          <div>
            <span>{t('feedback.success.id')}</span>
            <strong>{s.lastSubmitted.id}</strong>
          </div>
          <button
            type="button"
            aria-label={t('feedback.success.copy')}
            title={t('feedback.success.copy')}
            onClick={() => void navigator.clipboard.writeText(s.lastSubmitted!.id)}
          >
            <Copy size={16} />
          </button>
        </div>

        <div className="feedback-success__divider" />
        <p className="feedback-success__guide">{t('feedback.success.guide')}</p>
      </div>

      <footer className="feedback-footer">
        <button
          type="button"
          className="feedback-button feedback-button--secondary"
          onClick={() => {
            s.resetDraft();
            s.setTab('mine');
          }}
        >
          {t('feedback.success.viewMine')}
        </button>
        <button
          type="button"
          className="feedback-button feedback-button--primary"
          onClick={() => {
            s.resetDraft();
            s.closePanel();
          }}
        >
          {t('feedback.success.ok')}
        </button>
      </footer>
    </section>
  );
}

function reportTitle(report: FeedbackReport, t: (key: string) => string): string {
  return report.source === 'auto' ? t('feedback.mine.autoTitle') : t(`feedback.types.${report.type}`);
}

function deliveryLabel(report: FeedbackReport): string {
  const status = report.delivery?.status;
  if (!status) return 'local';
  if (status === 'published') return 'published';
  if (status === 'failed') return 'failed';
  if (status === 'queued') return 'queued';
  return 'working';
}

function MineTab() {
  const { t } = useTranslation();
  const s = useFeedbackStore();

  let content: React.ReactNode;
  if (s.loading) {
    content = <Loader2 size={18} className="feedback-spinner feedback-mine__loader" />;
  } else if (s.reports.length === 0) {
    content = <p className="feedback-mine__empty">{t('feedback.mine.empty')}</p>;
  } else {
    content = s.reports.map((report) => {
      const canConfirm = report.status === 'pending-confirm' && !!report.email;
      return (
        <article key={report.id} className="feedback-report">
          <div className="feedback-report__headline">
            <h3>{reportTitle(report, t)}</h3>
            <span className={`feedback-status feedback-status--${report.status}`}>
              {t(`feedback.status.${report.status}`)}
            </span>
          </div>
          {report.description && <p className="feedback-report__description">{report.description}</p>}
          <p className="feedback-report__meta">
            <span>{t('feedback.mine.id')} {report.id}</span>
            <i>·</i>
            <span>{t('feedback.mine.updated')} {new Date(report.updatedAt).toLocaleString()}</span>
            <i>·</i>
            <span className={`feedback-delivery feedback-delivery--${deliveryLabel(report)}`}>
              {t(`feedback.delivery.${deliveryLabel(report)}`)}
            </span>
            {report.delivery?.issueUrl && (
              <a
                className="feedback-report__issue-link"
                href={report.delivery.issueUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={t('feedback.delivery.openIssue')}
                title={t('feedback.delivery.openIssue')}
              >
                <ExternalLink size={13} strokeWidth={1.8} />
              </a>
            )}
          </p>
          <div className="feedback-report__progress">
            <MessageCircle size={16} strokeWidth={1.8} />
            <span>{t(`feedback.statusHint.${report.status}`)}</span>
          </div>
          {canConfirm && (
            <div className="feedback-report__actions">
              <button
                type="button"
                className="feedback-button feedback-button--primary feedback-button--compact"
                onClick={() => void s.setStatus(report.id, 'resolved')}
              >
                {t('feedback.actions.resolved')}
              </button>
              <button
                type="button"
                className="feedback-button feedback-button--secondary feedback-button--compact"
                onClick={() => void s.setStatus(report.id, 'processing')}
              >
                {t('feedback.actions.stillBroken')}
              </button>
            </div>
          )}
        </article>
      );
    });
  }

  return (
    <section className="feedback-mine">
      <div className="feedback-mine__body">{content}</div>
      <footer className="feedback-footer">
        <button type="button" className="feedback-button feedback-button--primary" onClick={() => s.closePanel()}>
          {t('common.close')}
        </button>
      </footer>
    </section>
  );
}

export function FeedbackPanel() {
  const s = useFeedbackStore();
  const brand = 'var(--color-brand-primary)';

  return (
    <Dialog open={s.open} onOpenChange={(open) => (open ? s.openPanel() : s.closePanel())}>
      <DialogContent hideClose className="feedback-dialog">
        <FeedbackHeader />
        {s.tab === 'write' ? <WriteTab /> : <MineTab />}
      </DialogContent>
    </Dialog>
  );
}
