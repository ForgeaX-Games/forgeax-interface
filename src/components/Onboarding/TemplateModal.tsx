import type { GameTemplate } from '../../lib/game-templates';
import type { TFn } from './OnboardingController';

export function TemplateModal(props: {
  error: string | null; onRetry: () => void;
  t: TFn; templates: GameTemplate[] | null; selected: string | null;
  onSelect: (slug: string) => void; onCancel: () => void; onConfirm: () => void; busy: boolean;
}) {
  const { t } = props;
  const loading = props.templates === null && props.error === null;
  const empty = props.templates?.length === 0 && props.error === null;
  return (
    <div className="fx-ob-modal-scrim" onClick={(e) => { if (e.target === e.currentTarget) props.onCancel(); }}>
      <div className="fx-ob-modal">
        <div className="fx-ob-modal-inner">
          <h3 className="fx-ob-h3">{t('onboarding.template.title')}</h3>
          {loading && <div className="fx-ob-small fx-ob-muted">{t('onboarding.template.loading')}</div>}
          {empty && <div className="fx-ob-small fx-ob-muted">{t('onboarding.template.empty')}</div>}
          {props.error !== null && <div role="alert" className="fx-ob-small">{t('onboarding.template.failed', { error: props.error })}</div>}
          {(empty || props.error !== null) && (
            <>
              <div className="fx-ob-small fx-ob-muted">{t('onboarding.template.recovery')}</div>
              <button className="fx-ob-btn fx-ob-btn-ghost" onClick={props.onRetry}>{t('onboarding.template.retry')}</button>
            </>
          )}
          {!loading && !empty && props.error === null && (
            <div className="fx-ob-stack fx-ob-gap8" style={{ maxHeight: 320, overflowY: 'auto' }}>
              {props.templates!.map((tpl) => (
                <div key={tpl.slug} className={`fx-ob-card${props.selected === tpl.slug ? ' sel' : ''}`} style={{ cursor: 'pointer' }} onClick={() => props.onSelect(tpl.slug)}>
                  <div className="fx-ob-card-cb">
                    <div className="fx-ob-row">
                      <span className="fx-ob-small">{tpl.name}</span>
                      <span className="fx-ob-tiny fx-ob-muted" style={{ marginLeft: 8 }}>{tpl.slug}</span>
                      <div className="fx-ob-grow" />
                      {props.selected === tpl.slug && <span className="fx-ob-pill sm active static">{t('onboarding.template.picked')}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="fx-ob-row" style={{ justifyContent: 'flex-end' }}>
            <button className="fx-ob-btn fx-ob-btn-ghost" onClick={props.onCancel}>{t('onboarding.template.cancel')}</button>
            <button className="fx-ob-btn fx-ob-btn-primary" disabled={props.busy || !props.templates?.some((template) => template.slug === props.selected)} onClick={props.onConfirm}>{t('onboarding.template.confirm')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
