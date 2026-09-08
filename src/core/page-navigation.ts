import type { AppHost } from './app-shell/types';
import type { ResourceDescriptor } from '@forgeax/types';
import { extensionIdSlug } from '../lib/extension-api';

let current: AppHost | null = null;

export function installPageNavigation(host: AppHost): () => void {
  current = host;
  return () => { if (current === host) current = null; };
}

/** Resolve an overlay through the product shell's live panel registry.
 *  Store ids are the lower-case form used by the existing overlay hosts
 *  (`Settings` -> `settings`, `Dashboard` -> `dashboard`). */
export function resolveRegisteredOverlayId(requestedId: string): string | null {
  if (!current) return null;
  const requested = requestedId.trim().toLocaleLowerCase();
  if (!requested) return null;
  const overlays = current.panels.overlays ?? {};
  const registered = Object.entries(overlays).find(([id, renderer]) =>
    typeof renderer === 'function' && id.toLocaleLowerCase() === requested,
  );
  return registered ? registered[0].toLocaleLowerCase() : null;
}

/** Match an extension id against a registered singleton page. */
export function extensionPageMatches(extensionId: string, owner: string, typeId: string): boolean {
  const requested = extensionId.trim();
  if (!requested) return false;
  const needle = extensionIdSlug(requested);
  return (
    owner === requested ||
    extensionIdSlug(owner) === needle ||
    typeId === requested ||
    extensionIdSlug(typeId) === needle
  );
}

export async function openExtensionPage(extensionId: string): Promise<void> {
  if (!current) throw new Error('Page host is not ready');
  const page = [...current.pageRegistry.getSnapshot().pageTypes.entries()].find(
    ([typeId, resolved]) =>
      resolved.status === 'available' && extensionPageMatches(extensionId, resolved.owner, typeId),
  );
  if (!page) throw new Error(`extension "${extensionId}" contributes no available singleton page`);
  const [typeId, resolved] = page;
  if (resolved.definition.cardinality !== 'singleton') {
    throw new Error(`extension "${extensionId}" has no default singleton page`);
  }
  await current.pages.open({ typeId });
}

export async function openPageType(typeId: string): Promise<void> {
  if (!current) throw new Error('Page host is not ready');
  await current.pages.open({ typeId: typeId as Parameters<AppHost['pages']['open']>[0]['typeId'] });
}

export async function openResource(resource: ResourceDescriptor): Promise<void> {
  if (!current) throw new Error('Page host is not ready');
  await current.resourceEditors.open(resource);
}
