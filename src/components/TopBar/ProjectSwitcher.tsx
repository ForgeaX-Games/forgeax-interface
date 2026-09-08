// Game-directory open modal and project-id synchronisation.
//
// A Studio project is exactly one game directory. The runtime host may mount
// that directory internally for the engine, but it is never exposed as a
// project/game directory to the user.
import { useState } from 'react';
import { useTranslation } from '@/i18n';
import { getStudioProjectClient, useShellStore } from '../../store';
import { FsBrowser } from './FsBrowser';
import './FsBrowser.css';
import './TopBar.css';

export function GameDirectoryModalHost() {
  const open = useShellStore((s) => s.gameDirectoryModalOpen);
  const close = useShellStore((s) => s.closeGameDirectoryModal);
  if (!open) return null;
  return <OpenGameDirectoryModal onClose={close} />;
}

function OpenGameDirectoryModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setActiveGame = useShellStore((s) => s.setActiveGame);

  const submitOpen = async (absPath: string) => {
    setBusy(true);
    setErr(null);
    try {
      const j = await getStudioProjectClient().linkProject(absPath);
      if (!j.ok || !j.slug) throw new Error(j.error ?? 'Unable to link project');
      onClose();
      await setActiveGame(j.slug);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="tb-modal-overlay" onClick={onClose}>
      <div className="tb-modal tb-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="tb-modal-title">{t('gameDirectory.openTitle')}</div>
        <FsBrowser
          initialDir="~"
          onPick={submitOpen}
          onCancel={onClose}
          busy={busy}
          externalError={err}
        />
      </div>
    </div>
  );
}
