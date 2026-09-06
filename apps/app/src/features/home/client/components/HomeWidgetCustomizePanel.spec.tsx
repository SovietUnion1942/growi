// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { HomeWidgetPreferences } from '~/features/home/interfaces/home-widgets';

const updateUserUISettingsMock = vi.fn();
vi.mock('~/client/services/user-ui-settings', () => ({
  updateUserUISettings: (...args: unknown[]) =>
    updateUserUISettingsMock(...args),
}));

const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();
vi.mock('~/client/util/toastr', () => ({
  toastError: (...args: unknown[]) => toastErrorMock(...args),
  toastSuccess: (...args: unknown[]) => toastSuccessMock(...args),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

let lastHomeWidgetsProps: Record<string, unknown> | undefined;
vi.mock('./widgets/HomeWidgets', () => ({
  HomeWidgets: (props: Record<string, unknown>) => {
    lastHomeWidgetsProps = props;
    return <div data-testid="home-widgets" />;
  },
}));

let lastReorderProps: Record<string, unknown> | undefined;
vi.mock('./HomeWidgetReorderList', () => ({
  HomeWidgetReorderList: (props: Record<string, unknown>) => {
    lastReorderProps = props;
    const onMove = props.onMove as
      | ((k: string, d: 'up' | 'down') => void)
      | undefined;
    const onToggle = props.onToggleVisible as ((k: string) => void) | undefined;
    return (
      <div data-testid="reorder-list">
        <span data-testid="reorder-count">
          {String((props.entries as unknown[] | undefined)?.length ?? 0)}
        </span>
        <button
          type="button"
          data-testid="reorder-move-bookmarks-down"
          onClick={() => onMove?.('bookmarks', 'down')}
        />
        <button
          type="button"
          data-testid="reorder-toggle-bookmarks"
          onClick={() => onToggle?.('bookmarks')}
        />
      </div>
    );
  },
}));

import { HomeWidgetCustomizePanel } from './HomeWidgetCustomizePanel';

const enterCustomizeMode = () => {
  fireEvent.click(screen.getByText('home.customize.toggle'));
};

describe('HomeWidgetCustomizePanel', () => {
  beforeEach(() => {
    updateUserUISettingsMock.mockReset().mockResolvedValue({ data: {} });
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    lastHomeWidgetsProps = undefined;
    lastReorderProps = undefined;
  });

  it('shows only the customize toggle when not customizing, and passes the persisted prefs through', () => {
    const persisted: HomeWidgetPreferences = { bookmarks: { order: 5 } };
    render(<HomeWidgetCustomizePanel homeWidgetPreferences={persisted} />);

    expect(screen.getByText('home.customize.toggle')).toBeInTheDocument();
    expect(screen.queryByText('home.customize.save')).not.toBeInTheDocument();
    expect(screen.getByTestId('home-widgets')).toBeInTheDocument();
    expect(screen.queryByTestId('reorder-list')).not.toBeInTheDocument();
    expect(lastHomeWidgetsProps?.userWidgetPreferences).toBe(persisted);
  });

  it('reveals the control bar and enters customize mode on toggle', () => {
    render(<HomeWidgetCustomizePanel />);
    enterCustomizeMode();

    expect(screen.getByText('home.customize.save')).toBeInTheDocument();
    expect(screen.getByText('home.customize.reset')).toBeInTheDocument();
    // The live widgets are replaced by the compact reorder list while editing.
    expect(screen.getByTestId('reorder-list')).toBeInTheDocument();
    expect(screen.queryByTestId('home-widgets')).not.toBeInTheDocument();

    const entries = lastReorderProps?.entries as
      | { key: string; visible: boolean }[]
      | undefined;
    expect(entries).toHaveLength(7);
  });

  it('moving a widget down then saving persists the whole map with that widget ordered later (Req 6.2)', async () => {
    render(<HomeWidgetCustomizePanel />);
    enterCustomizeMode();

    fireEvent.click(screen.getByTestId('reorder-move-bookmarks-down'));
    fireEvent.click(screen.getByText('home.customize.save'));

    await waitFor(() =>
      expect(updateUserUISettingsMock).toHaveBeenCalledTimes(1),
    );
    const arg = updateUserUISettingsMock.mock.calls[0][0] as {
      homeWidgetPreferences: HomeWidgetPreferences;
    };
    // bookmarks default order is 30; moving it down past wipPages (40) must
    // raise its explicit order.
    expect(arg.homeWidgetPreferences.bookmarks?.order).toBeGreaterThan(30);
    expect(arg.homeWidgetPreferences.wipPages?.order).toBeLessThan(
      arg.homeWidgetPreferences.bookmarks?.order as number,
    );
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
    expect(screen.queryByText('home.customize.save')).not.toBeInTheDocument();
  });

  it('hiding a widget then saving persists visible:false for that widget', async () => {
    render(<HomeWidgetCustomizePanel />);
    enterCustomizeMode();

    fireEvent.click(screen.getByTestId('reorder-toggle-bookmarks'));
    fireEvent.click(screen.getByText('home.customize.save'));

    await waitFor(() =>
      expect(updateUserUISettingsMock).toHaveBeenCalledTimes(1),
    );
    const arg = updateUserUISettingsMock.mock.calls[0][0] as {
      homeWidgetPreferences: HomeWidgetPreferences;
    };
    expect(arg.homeWidgetPreferences.bookmarks?.visible).toBe(false);
  });

  it('"初期状態に戻す" clears the per-user settings (Req 6.4)', async () => {
    render(
      <HomeWidgetCustomizePanel
        homeWidgetPreferences={{ bookmarks: { visible: false } }}
      />,
    );
    enterCustomizeMode();

    fireEvent.click(screen.getByText('home.customize.reset'));

    await waitFor(() =>
      expect(updateUserUISettingsMock).toHaveBeenCalledWith({
        homeWidgetPreferences: {},
      }),
    );
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
    expect(screen.queryByText('home.customize.save')).not.toBeInTheDocument();
  });

  it('keeps customize mode and the working edits on save failure, showing an error toast', async () => {
    updateUserUISettingsMock.mockRejectedValue(new Error('save failed'));
    render(<HomeWidgetCustomizePanel />);
    enterCustomizeMode();

    fireEvent.click(screen.getByTestId('reorder-move-bookmarks-down'));
    fireEvent.click(screen.getByText('home.customize.save'));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(screen.getByText('home.customize.save')).toBeInTheDocument();
    expect(screen.getByTestId('reorder-list')).toBeInTheDocument();

    // Working edits retained: a second save still sends the moved order.
    updateUserUISettingsMock.mockResolvedValueOnce({ data: {} });
    fireEvent.click(screen.getByText('home.customize.save'));
    await waitFor(() =>
      expect(updateUserUISettingsMock).toHaveBeenCalledTimes(2),
    );
    const secondArg = updateUserUISettingsMock.mock.calls[1][0] as {
      homeWidgetPreferences: HomeWidgetPreferences;
    };
    expect(secondArg.homeWidgetPreferences.bookmarks?.order).toBeGreaterThan(
      30,
    );
  });
});
