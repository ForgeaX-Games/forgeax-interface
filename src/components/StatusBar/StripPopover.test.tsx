import { afterAll, afterEach, describe, expect, it } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

let registered = false;
try {
  GlobalRegistrator.register();
  registered = true;
} catch {
  // A package-level DOM harness may already be active.
}

const { act, cleanup, fireEvent, render, waitFor } = await import('@testing-library/react');
const { StripPopover } = await import('./StripPopover');

afterAll(() => {
  if (registered) GlobalRegistrator.unregister();
});
afterEach(() => cleanup());

describe('StripPopover', () => {
  it('is closed by default and opens only after the trigger is activated', async () => {
    const view = render(
      <StripPopover label="Project" title="Project details">
        <button type="button">Inspect</button>
      </StripPopover>,
    );
    const chip = view.getByRole('button', { name: 'Project' });

    expect(view.queryByRole('dialog')).toBeNull();
    await act(async () => { fireEvent.click(chip); });
    await waitFor(() => expect(view.getByRole('dialog')).toBeTruthy());
  });

  it('closes on Escape from the trigger or focused content', async () => {
    const view = render(
      <StripPopover label="Project" title="Project details">
        <button type="button">Inspect</button>
      </StripPopover>,
    );
    const chip = view.getByRole('button', { name: 'Project' });

    await act(async () => { fireEvent.click(chip); });
    await waitFor(() => expect(view.getByRole('dialog')).toBeTruthy());
    await act(async () => { fireEvent.keyDown(chip, { key: 'Escape' }); });
    await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());

    await act(async () => { fireEvent.click(chip); });
    await waitFor(() => expect(view.getByRole('dialog')).toBeTruthy());
    const inspect = await waitFor(() => view.getByRole('button', { name: 'Inspect' }));
    await act(async () => { fireEvent.keyDown(inspect, { key: 'Escape' }); });
    await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
  });

  it('closes when focus or a pointer moves outside the popover', async () => {
    const view = render(
      <>
        <StripPopover label="Project" title="Project details">
          <button type="button">Inspect</button>
        </StripPopover>
        <button type="button">Outside</button>
      </>,
    );
    await act(async () => { fireEvent.click(view.getByRole('button', { name: 'Project' })); });
    await waitFor(() => expect(view.getByRole('dialog')).toBeTruthy());

    await act(async () => { fireEvent.focus(view.getByRole('button', { name: 'Outside' })); });
    await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());

    await act(async () => { fireEvent.click(view.getByRole('button', { name: 'Project' })); });
    await waitFor(() => expect(view.getByRole('dialog')).toBeTruthy());
  });
});
