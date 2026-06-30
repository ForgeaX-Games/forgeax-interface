/**
 * MemorySettingsSection — 记忆自动沉淀开关(总开关 + 分模型开关 + 省/不省 token 提示)。
 *
 * 后端 /api/memory-settings:GET → { config:{master,perKernel}, kernels:[{id,cacheWarmCapable}] };
 * PUT → 保存 config。前端**不依赖 @forgeax/***(interface 保持 agnostic)——生效/提示逻辑就是
 * 极简布尔:`enabled = master && (perKernel[id] ?? cacheWarmCapable)`;cache-incapable 内核标
 * 「不省 token」并提示。设计稿 §4/§8。
 */
import { useEffect, useState, type ReactNode } from 'react';

interface KernelCap {
  id: string;
  cacheWarmCapable: boolean;
}
interface MemCfg {
  master: boolean;
  perKernel: Record<string, boolean>;
}

const rowStyle = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 12 } as const;
const hintStyle = { fontSize: 11, opacity: 0.6, marginTop: 2 } as const;

export function MemorySettingsSection(): ReactNode {
  const [cfg, setCfg] = useState<MemCfg>({ master: true, perKernel: {} });
  const [kernels, setKernels] = useState<KernelCap[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/memory-settings')
      .then((r) => r.json())
      .then((j: { config?: MemCfg; kernels?: KernelCap[] }) => {
        if (!alive) return;
        if (j?.config) setCfg({ master: !!j.config.master, perKernel: j.config.perKernel ?? {} });
        if (Array.isArray(j?.kernels)) setKernels(j.kernels);
        setReady(true);
      })
      .catch(() => setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  const save = (next: MemCfg): void => {
    setCfg(next);
    void fetch('/api/memory-settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next),
    }).catch(() => {});
  };

  /** 分模型生效:perKernel 覆盖优先,缺省按 cacheWarmCapable(warm→ON,cold→OFF)。 */
  const perKernelEnabled = (k: KernelCap): boolean => cfg.perKernel[k.id] ?? k.cacheWarmCapable;

  const toggleMaster = (): void => save({ ...cfg, master: !cfg.master });
  const togglePerKernel = (k: KernelCap): void =>
    save({ ...cfg, perKernel: { ...cfg.perKernel, [k.id]: !perKernelEnabled(k) } });

  if (!ready) return <div style={hintStyle}>加载中…</div>;

  return (
    <div>
      <label style={{ ...rowStyle, fontWeight: 600 }}>
        <input type="checkbox" checked={cfg.master} onChange={toggleMaster} />
        总开关 · 自动记忆沉淀
      </label>
      <div style={hintStyle}>关闭则所有模型都不沉淀;开启后按下方分模型设置生效。</div>

      <div style={{ marginTop: 12, opacity: cfg.master ? 1 : 0.45, pointerEvents: cfg.master ? 'auto' : 'none' }}>
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>分模型</div>
        {kernels.length === 0 && <div style={hintStyle}>(无已注册内核)</div>}
        {kernels.map((k) => {
          const on = perKernelEnabled(k);
          return (
            <div key={k.id}>
              <label style={rowStyle}>
                <input type="checkbox" checked={on} onChange={() => togglePerKernel(k)} disabled={!cfg.master} />
                <span>{k.id}</span>
                {k.cacheWarmCapable ? (
                  <span style={{ fontSize: 10, color: '#4caf50', opacity: 0.85 }}>省 token(共享缓存)</span>
                ) : (
                  <span style={{ fontSize: 10, color: '#e0a030', opacity: 0.9 }}>⚠ 不省 token(无缓存,每轮额外开销)</span>
                )}
              </label>
              {!k.cacheWarmCapable && on && cfg.master && (
                <div style={{ ...hintStyle, color: '#e0a030' }}>
                  注意:{k.id} 的记忆沉淀无缓存、每轮额外烧 token。如不需要可在此关闭。
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
