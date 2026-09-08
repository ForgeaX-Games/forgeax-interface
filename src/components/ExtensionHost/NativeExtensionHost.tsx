import { useEffect, useRef, useState, type ReactElement } from 'react';
import type {
  ExtensionContext,
  ExtensionDisposable,
  ExtensionModule,
} from '@forgeax/toolkit/contracts';
import { getLocale, subscribeLocale } from '@/i18n';
import { removeExtensionSurfaces, upsertSurface } from '../../lib/surface-store';

interface NativeHostApi {
  handshake(): Promise<{ protocol: 1; mode: 'platform'; extensionId: string }>;
  chat: { post(text: string, attachments?: readonly string[]): void };
  surface: {
    expose(surfaceId: string, payload: { actions: readonly Record<string, unknown>[]; snapshot?: unknown }): void;
    onDispatch(handler: (input: { surfaceId: string; actionId: string; args: unknown }) => unknown | Promise<unknown>): ExtensionDisposable;
  };
  theme: { subscribe(handler: (theme: { locale?: 'zh' | 'en' | 'ja'; theme?: 'light' | 'dark' }) => void): ExtensionDisposable };
  visibility: { subscribe(handler: (state: { visible: boolean }) => void): ExtensionDisposable };
  ui: {
    flashElement(target: Element | string, durationMs?: number): void;
    onFlash(handler: (event: unknown) => void): ExtensionDisposable;
  };
  close(): void;
}

interface Props {
  extensionId: string;
  moduleUrl: string;
  allowedOrigin?: string;
  generation: number;
  active?: boolean;
  onChatPost?: (event: { text: string; attachments?: unknown[] }) => void;
}

function moduleSpecifier(moduleUrl: string, generation: number): string {
  const url = new URL(moduleUrl, window.location.href);
  url.searchParams.set('fxg', String(generation));
  return url.href;
}

export function NativeExtensionHost({
  extensionId,
  moduleUrl,
  allowedOrigin,
  generation,
  active = true,
  onChatPost,
}: Props): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  const visibilitySubscribers = useRef(new Set<(state: { visible: boolean }) => void>());
  const themeSubscribers = useRef(new Set<(theme: { locale?: 'zh' | 'en' | 'ja'; theme?: 'light' | 'dark' }) => void>());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    activeRef.current = active;
    for (const subscriber of visibilitySubscribers.current) subscriber({ visible: active });
  }, [active]);

  useEffect(() => subscribeLocale((locale) => {
    for (const subscriber of themeSubscribers.current) subscriber({ locale, theme: 'dark' });
  }), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    const effects: ExtensionDisposable[] = [];
    let view: { readonly root?: Element; dispose(): void } | undefined;
    let viewRoot: ParentNode = container;
    let closed = false;

    const disposeEffects = async (): Promise<void> => {
      closed = true;
      const errors: unknown[] = [];
      while (effects.length) {
        try { await effects.pop()?.(); } catch (cause) { errors.push(cause); }
      }
      view?.dispose();
      view = undefined;
      viewRoot = container;
      removeExtensionSurfaces(extensionId);
      visibilitySubscribers.current.clear();
      themeSubscribers.current.clear();
      if (errors.length) console.error('[NativeExtensionHost] cleanup failed', new AggregateError(errors));
    };

    const activate = async (): Promise<void> => {
      try {
        const expectedOrigin = allowedOrigin ?? window.location.origin;
        const parsedModuleUrl = new URL(moduleUrl, window.location.href);
        if (parsedModuleUrl.origin !== expectedOrigin || new URL(expectedOrigin).origin !== expectedOrigin) {
          throw new Error('moduleUrl does not match the registered allowedOrigin');
        }
        const loaded = await import(/* @vite-ignore */ moduleSpecifier(moduleUrl, generation)) as ExtensionModule;
        if (disposed) return;
        if (!loaded.extension || typeof loaded.extension.apply !== 'function') {
          throw new Error('extension module does not export extension.apply');
        }
        if (typeof loaded.createView !== 'function') {
          throw new Error('extension artifact does not provide its standard view renderer');
        }
        view = loaded.createView(container);
        viewRoot = view.root ?? container;
        const dispatchSubscribers = new Set<(input: { surfaceId: string; actionId: string; args: unknown }) => unknown | Promise<unknown>>();
        const flashSubscribers = new Set<(event: unknown) => void>();
        const host: NativeHostApi = {
          async handshake() { return { protocol: 1, mode: 'platform', extensionId }; },
          chat: { post: (text, attachments) => onChatPost?.({ text, attachments: attachments ? [...attachments] : undefined }) },
          surface: {
            expose(surfaceId, payload) {
              upsertSurface({
                extensionId,
                surfaceId,
                actions: payload.actions as never,
                snapshot: payload.snapshot,
                updatedAt: Date.now(),
              });
            },
            onDispatch(handler) { dispatchSubscribers.add(handler); return () => { dispatchSubscribers.delete(handler); }; },
          },
          theme: {
            subscribe(handler) {
              themeSubscribers.current.add(handler);
              handler({ locale: getLocale(), theme: 'dark' });
              return () => { themeSubscribers.current.delete(handler); };
            },
          },
          visibility: {
            subscribe(handler) {
              visibilitySubscribers.current.add(handler);
              handler({ visible: activeRef.current });
              return () => { visibilitySubscribers.current.delete(handler); };
            },
          },
          ui: {
            flashElement(target, durationMs = 1000) {
              const element = typeof target === 'string' ? viewRoot.querySelector(target) : target;
              element?.classList.add('forgeax-host-flash');
              if (element) setTimeout(() => element.classList.remove('forgeax-host-flash'), durationMs);
            },
            onFlash(handler) { flashSubscribers.add(handler); return () => { flashSubscribers.delete(handler); }; },
          },
          close() { closed = true; dispatchSubscribers.clear(); flashSubscribers.clear(); },
        };
        const services = new Map<string, unknown>([['host', host], ['view', view]]);
        const missing = loaded.extension.inject?.filter((name) => !services.has(name)) ?? [];
        if (missing.length) throw new Error(`extension requires unavailable services: ${missing.join(', ')}`);
        const context: ExtensionContext = {
          effect(setup) {
            if (closed || disposed) throw new Error('cannot register an effect after deactivation');
            const cleanup = setup();
            if (cleanup) effects.push(cleanup);
          },
          get: <T,>(name: string) => services.get(name) as T | undefined,
          logger: (name) => ({
            debug: (message, ...details) => console.debug(`[${extensionId}:${name}] ${message}`, ...details),
            info: (message, ...details) => console.info(`[${extensionId}:${name}] ${message}`, ...details),
            warn: (message, ...details) => console.warn(`[${extensionId}:${name}] ${message}`, ...details),
            error: (message, ...details) => console.error(`[${extensionId}:${name}] ${message}`, ...details),
          }),
        };
        await loaded.extension.apply(context, {});
        if (disposed) await disposeEffects();
      } catch (cause) {
        await disposeEffects();
        if (!disposed) setError(cause instanceof Error ? cause.message : String(cause));
      }
    };

    setError(null);
    void activate();
    return () => {
      disposed = true;
      void disposeEffects();
    };
  }, [allowedOrigin, extensionId, generation, moduleUrl, onChatPost]);

  return (
    <div className="page-plugin-iframe-wrap" data-active={active ? 'true' : 'false'}>
      {error ? <div role="alert" style={{ padding: 20, color: '#c44' }}>{error}</div> : null}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
