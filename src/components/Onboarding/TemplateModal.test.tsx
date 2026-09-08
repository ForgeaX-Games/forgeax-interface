import { afterEach, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { useGameTemplates } from '../../lib/use-game-templates';
import { TemplateModal } from './TemplateModal';
import en from '../../i18n/locales/en.json';
import type { TFn } from './OnboardingController';

const originalFetch = globalThis.fetch;
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; });
const t = ((key: string, params?: Record<string, unknown>) => {
  const text = en.onboarding.template[key.split('.').at(-1)! as keyof typeof en.onboarding.template];
  return text.replace('{error}', String(params?.error ?? ''));
}) as TFn;

function Harness({ onConfirm = () => {}, onCancel = () => {} }: { onConfirm?: () => void; onCancel?: () => void }) {
  const { templates, error, retry } = useGameTemplates(true);
  const [selected, onSelect] = useState<string | null>(null);
  return <TemplateModal t={t} templates={templates} error={error} onRetry={retry}
    selected={selected} onSelect={onSelect} onConfirm={onConfirm} onCancel={onCancel} busy={false} />;
}

const response = (templates: unknown[]) => new Response(JSON.stringify({ templates }));

test('lists templates and confirms only after a real selection', async () => {
  globalThis.fetch = (async () => response([{ slug: 'game-empty', name: 'Empty' }])) as typeof fetch;
  let confirmed = 0;
  const ui = render(<Harness onConfirm={() => confirmed++} />);
  const confirm = ui.getByText(en.onboarding.template.confirm) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  fireEvent.click(await ui.findByText('Empty'));
  expect(confirm.disabled).toBe(false);
  fireEvent.click(confirm);
  expect(confirmed).toBe(1);
});

test('an empty catalog explains alternatives and allows cancel', async () => {
  globalThis.fetch = (async () => response([])) as typeof fetch;
  let cancelled = 0;
  const ui = render(<Harness onCancel={() => cancelled++} />);
  await ui.findByText(en.onboarding.template.empty);
  expect(ui.getByText(en.onboarding.template.recovery)).toBeTruthy();
  expect(ui.queryByRole('alert')).toBeNull();
  expect((ui.getByText(en.onboarding.template.confirm) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(ui.getByText(en.onboarding.template.cancel));
  expect(cancelled).toBe(1);
});

test('HTTP failure is distinct from empty and retry can recover', async () => {
  let attempts = 0;
  globalThis.fetch = (async () => ++attempts === 1
    ? new Response('unavailable', { status: 503 })
    : response([{ slug: 'game-empty', name: 'Empty' }])) as typeof fetch;
  const ui = render(<Harness />);
  expect((await ui.findByRole('alert')).textContent).toContain('HTTP 503');
  expect(ui.queryByText(en.onboarding.template.empty)).toBeNull();
  fireEvent.click(ui.getByText(en.onboarding.template.retry));
  await ui.findByText('Empty');
  expect(ui.queryByRole('alert')).toBeNull();
  expect(attempts).toBe(2);
});

test('malformed successful response is shown as an error', async () => {
  globalThis.fetch = (async () => new Response('{"ok":true}')) as typeof fetch;
  const ui = render(<Harness />);
  expect((await ui.findByRole('alert')).textContent).toContain('Invalid template catalog response');
  expect(ui.queryByText(en.onboarding.template.empty)).toBeNull();
});

test('closing ignores a late response and reopening loads a fresh catalog', async () => {
  let resolveOld!: (value: Response) => void;
  let calls = 0;
  globalThis.fetch = (async () => ++calls === 1
    ? new Promise<Response>((resolve) => { resolveOld = resolve; })
    : response([{ slug: 'fresh', name: 'Fresh' }])) as typeof fetch;
  function Toggle({ open }: { open: boolean }) {
    const state = useGameTemplates(open);
    return <div>{state.templates?.map((item) => item.name).join(',') ?? state.error ?? 'loading'}</div>;
  }
  const ui = render(<Toggle open={true} />);
  ui.rerender(<Toggle open={false} />);
  ui.rerender(<Toggle open={true} />);
  await ui.findByText('Fresh');
  resolveOld(response([{ slug: 'stale', name: 'Stale' }]));
  await waitFor(() => expect(ui.queryByText('Stale')).toBeNull());
  expect(ui.getByText('Fresh')).toBeTruthy();
});
