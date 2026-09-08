/**
 * ForgeaX build projection for the footer.
 *
 * This is application build metadata from `/api/version`, not the current
 * game's Git version. Game version control is contributed by edit-runtime.
 */
import { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { StripPopover } from '../StripPopover';
import type { StatusItemContribution } from '../../../core/panels';
import './footer.css';

interface BuildInfo {
  readonly version: string;
  readonly sha: string;
  readonly date: string;
  readonly totalCommits: number;
  readonly branch: string;
}

interface BuildTag {
  readonly tag: string;
  readonly date: string;
  readonly message: string;
}

const FALLBACK: BuildInfo = { version: 'v0.?.?.?', sha: '?', date: '?', totalCommits: 0, branch: '?' };

export function ForgeaxBuildChip() {
  const [info, setInfo] = useState<BuildInfo>(FALLBACK);
  const [tags, setTags] = useState<readonly BuildTag[]>([]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      fetch('/api/version')
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (!cancelled && data) setInfo(data as BuildInfo);
        })
        .catch(() => {});
      fetch('/api/version/tags')
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (!cancelled && data) setTags((data as { tags?: BuildTag[] }).tags ?? []);
        })
        .catch(() => {});
    };
    refresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', refresh);
    const poll = window.setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', refresh);
      window.clearInterval(poll);
    };
  }, []);

  return (
    <StripPopover
      icon="Layers"
      label={info.version}
      tooltip="ForgeaX build version"
      title={
        <>
          <Layers size={13} />
          ForgeaX build
        </>
      }
    >
      <div className="fx-pop-sec">
        <div className="fx-kv">
          <span>Build version</span>
          <b>{info.version}</b>
        </div>
        <div className="fx-kv">
          <span>Build identity</span>
          <b>{info.branch} · {info.sha}</b>
        </div>
      </div>
      <div className="fx-pop-div" />
      {tags.length === 0 ? (
        <div className="fx-empty">No build tags</div>
      ) : (
        tags.map((tag) => (
          <div key={tag.tag} className="fx-ver">
            <span className="ver">{tag.tag}</span>
            <span className="lbl">{tag.message}</span>
            <span className="t">{tag.date}</span>
          </div>
        ))
      )}
    </StripPopover>
  );
}

export const forgeaxBuildVersionStatusItem: StatusItemContribution = {
  kind: 'status-item',
  id: 'forgeax-build-version',
  location: 'statusbar.right',
  priority: 1000,
  item: { type: 'custom', render: () => <ForgeaxBuildChip /> },
};
