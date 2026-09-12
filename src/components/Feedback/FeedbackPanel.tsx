/**
 * FeedbackPanel — 「写反馈 / 我的反馈」两页签面板。
 *
 * 视觉 SSOT: docs/features/feedback-prototype/img04.png(写反馈)、
 * img06.png(截图缩略图)、img07.png(提交成功)、img08.png(我的反馈)。
 */

import { useEffect, useRef, useState } from 'react';
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
import { useHost } from '../../core/app-shell';
import { captureUiScreenshot, compressUploadedImage } from '../../lib/ui-screenshot';
import { clipboardImageFiles, isClipboardPasteControl } from './clipboard-images';
import type { PendingFeedbackSubmission } from './pending-store';
import { useFeedbackStore } from './store';
import './FeedbackPanel.css';

const TYPE_KEYS: FeedbackType[] = ['stuck', 'wrong', 'slow', 'ui', 'idea', 'other'];

type Translate = ReturnType<typeof useTranslation>['t'];

function requestErrorMessage(code: string, detail: string | null, t: Translate): string {
  if (code === 'server-unreachable') return t('feedback.errors.serverUnavailable');
  if (code === 'request-timeout') return t('feedback.errors.requestTimeout');
  if (code === 'invalid-response') return t('feedback.errors.invalidResponse');
  if (code === 'load-failed') return t('feedback.errors.loadFailed');
  if (code === 'local-save-failed') return t('feedback.errors.localSaveFailed');
  return t('feedback.errors.submitFailed', { detail: detail ?? code });
}

function formatAttemptTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function FeedbackLoadError({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const s = useFeedbackStore();
  if (!s.loadError) return null;

  return (
    <div className={`feedback-load-error${compact ? ' feedback-load-error--compact' : ''}`} role="status">
      <p>{requestErrorMessage(s.loadError, s.loadErrorDetail, t)}</p>
      {s.loadErrorDetail && <code title={s.loadErrorDetail}>{s.loadErrorDetail}</code>}
      <button
        type="button"
        className="feedback-button feedback-button--secondary feedback-button--compact"
        disabled={s.loading}
        onClick={() => void s.loadReports()}
      >
        {s.loading && <Loader2 size={13} className="feedback-spinner" />}
        {t('feedback.errors.retryConnection')}
      </button>
    </div>
  );
}

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
          {s.reports.length + s.pendingSubmissions.length > 0 && (
            <span className="feedback-tab__count">{s.reports.length + s.pendingSubmissions.length}</span>
          )}
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

  const addImageFiles = (files: readonly File[]) => {
    const remaining = Math.max(0, 5 - s.screenshots.length);
    for (const file of files.slice(0, remaining)) {
      void compressUploadedImage(file)
        .then((url) => s.addScreenshot({ previewUrl: url, ref: url, kind: 'upload' }))
        .catch(() => {
          /* 非图片/解码失败等 —— 静默跳过,不阻塞其余文件的上传 */
        });
    }
  };

  const onUpload = (files: FileList | null) => {
    if (files) addImageFiles(Array.from(files));
  };

  useEffect(() => {
    const onDocumentPaste = (event: ClipboardEvent) => {
      // Inputs/buttons keep complete ownership of paste. Only the unfocused
      // write form treats a pasted image as a screenshot attachment.
      if (isClipboardPasteControl(document.activeElement) || isClipboardPasteControl(event.target)) return;
      const images = clipboardImageFiles(event.clipboardData);
      if (images.length === 0) return;
      event.preventDefault();
      const remaining = Math.max(0, 5 - useFeedbackStore.getState().screenshots.length);
      for (const file of images.slice(0, remaining)) {
        void compressUploadedImage(file)
          .then((url) => useFeedbackStore.getState().addScreenshot({
            previewUrl: url,
            ref: url,
            kind: 'upload',
          }))
          .catch(() => {
            /* 非图片/解码失败等 —— 静默跳过,不阻塞其余剪切板图片 */
          });
      }
    };
    document.addEventListener('paste', onDocumentPaste);
    return () => document.removeEventListener('paste', onDocumentPaste);
  }, []);

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
            <span>{t('feedback.form.screenshotLimit')} · {t('feedback.form.pasteScreenshot')}</span>
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

        {s.submitError && !['description-required', 'email-required'].includes(s.submitError) ? (
          <div className="feedback-error" role="alert">
            <strong>{requestErrorMessage(s.submitError, s.submitErrorDetail, t)}</strong>
            {s.submitErrorDetail && <code title={s.submitErrorDetail}>{s.submitErrorDetail}</code>}
            {s.submitAttempts > 0 && s.lastSubmitAttemptAt !== null && (
              <span>
                {t('feedback.errors.attempt', {
                  attempt: s.submitAttempts,
                  time: formatAttemptTime(s.lastSubmitAttemptAt),
                })}
              </span>
            )}
          </div>
        ) : (
          <FeedbackLoadError compact />
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
          {s.submitError && !['description-required', 'email-required'].includes(s.submitError)
            ? t('feedback.errors.retrySubmit')
            : t('feedback.form.submit')}
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

function PendingReportCard({ entry }: { entry: PendingFeedbackSubmission }) {
  const { t } = useTranslation();
  const s = useFeedbackStore();
  const retrying = s.retryingPendingIds.includes(entry.id);
  const title = entry.submit.source === 'auto'
    ? t('feedback.mine.autoTitle')
    : t(`feedback.types.${entry.submit.type}`);

  return (
    <article className="feedback-report feedback-report--pending">
      <div className="feedback-report__headline">
        <h3>{title}</h3>
        <span className="feedback-status feedback-status--pending-local">
          {t('feedback.mine.pendingSend')}
        </span>
      </div>
      {entry.submit.description && <p className="feedback-report__description">{entry.submit.description}</p>}
      <p className="feedback-report__meta">
        <span>{t('feedback.mine.localId')} {entry.id}</span>
        <i>·</i>
        <span>{t('feedback.mine.saved')} {new Date(entry.updatedAt).toLocaleString()}</span>
        <i>·</i>
        <span className="feedback-delivery feedback-delivery--failed">{t('feedback.mine.savedLocally')}</span>
      </p>
      <div className="feedback-report__progress feedback-report__progress--pending">
        <MessageCircle size={16} strokeWidth={1.8} />
        <span>{entry.lastError ?? t('feedback.mine.pendingHint')}</span>
      </div>
      <div className="feedback-report__actions">
        <button
          type="button"
          className="feedback-button feedback-button--primary feedback-button--compact"
          disabled={retrying}
          onClick={() => void s.retryPending(entry.id)}
        >
          {retrying && <Loader2 size={13} className="feedback-spinner" />}
          {t('feedback.mine.retryPending')}
        </button>
        <span className="feedback-report__attempts">
          {t('feedback.mine.attempts', { count: entry.attempts })}
        </span>
      </div>
    </article>
  );
}

function MineTab() {
  const { t } = useTranslation();
  const s = useFeedbackStore();
  const host = useHost();

  let content: React.ReactNode;
  const hasRecords = s.reports.length + s.pendingSubmissions.length > 0;
  if (s.loading && !hasRecords) {
    content = <Loader2 size={18} className="feedback-spinner feedback-mine__loader" />;
  } else if (!hasRecords && s.loadError) {
    content = <FeedbackLoadError />;
  } else if (!hasRecords) {
    content = <p className="feedback-mine__empty">{t('feedback.mine.empty')}</p>;
  } else {
    content = (
      <>
        {s.loadError && <FeedbackLoadError compact />}
        {s.pendingSubmissions.map((entry) => <PendingReportCard key={entry.id} entry={entry} />)}
        {s.reports.map((report) => {
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
                  <button
                    type="button"
                    className="feedback-report__issue-link"
                    onClick={() => void host.commands.execute('app.open_url', { url: report.delivery!.issueUrl })}
                    aria-label={t('feedback.delivery.openIssue')}
                    title={t('feedback.delivery.openIssue')}
                  >
                    <ExternalLink size={13} strokeWidth={1.8} />
                  </button>
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
        })}
      </>
    );
  }

  return (
    <section className="feedback-mine">
      <div className="feedback-mine__body">
        {s.refreshFailed && !s.loadError && <p role="status">{t('feedback.delivery.refreshFailed')}</p>}
        {content}
      </div>
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

  useEffect(() => {
    if (!s.open || s.tab !== 'mine') return;
    let stopped = false;
    // Wait for each refresh before scheduling another, so slow requests do not
    // accumulate. Keep cards visible while background delivery changes state.
    const refresh = async () => {
      await s.loadReports({ silent: true });
      if (!stopped) timer = setTimeout(refresh, 5_000);
    };
    let timer = setTimeout(refresh, 5_000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [s.open, s.tab, s.loadReports]);

  return (
    <Dialog open={s.open} onOpenChange={(open) => (open ? s.openPanel() : s.closePanel())}>
      <DialogContent hideClose className="feedback-dialog">
        <FeedbackHeader />
        {s.tab === 'write' ? <WriteTab /> : <MineTab />}
      </DialogContent>
    </Dialog>
  );
}
