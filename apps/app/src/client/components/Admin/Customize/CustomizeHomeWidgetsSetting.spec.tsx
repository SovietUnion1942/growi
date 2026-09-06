import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'unstated';

import AdminCustomizeContainer from '~/client/services/AdminCustomizeContainer';
import { apiv3Put } from '~/client/util/apiv3-client';
import { toastError, toastSuccess } from '~/client/util/toastr';
import type { PinnedPageEntry } from '~/features/home/interfaces/home-widgets';

import CustomizeHomeWidgetsSetting from './CustomizeHomeWidgetsSetting';

type SavePayload = {
  homeWidgets: Record<string, { visible: boolean; order: number }>;
  homePinnedPages: PinnedPageEntry[];
  homeClassroomPathPrefix: string | null;
};

const savedArg = (changeSpy: { mock: { calls: unknown[][] } }): SavePayload =>
  changeSpy.mock.calls[0][0] as SavePayload;

vi.mock('~/client/util/apiv3-client');
vi.mock('~/client/util/toastr');

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const renderSetting = (container: AdminCustomizeContainer) =>
  render(
    <Provider inject={[container]}>
      <CustomizeHomeWidgetsSetting />
    </Provider>,
  );

const setupContainer = () => {
  const container = new AdminCustomizeContainer();
  const changeSpy = vi.spyOn(container, 'changeHomeWidgetsSettings');
  const updateSpy = vi
    .spyOn(container, 'updateHomeWidgets')
    .mockResolvedValue(undefined);
  return { container, changeSpy, updateSpy };
};

const clickUpdate = () =>
  userEvent.click(screen.getByRole('button', { name: 'Update' }));

describe('CustomizeHomeWidgetsSetting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiv3Put).mockResolvedValue(
      // biome-ignore lint/suspicious/noExplicitAny: minimal stub for a mocked client
      { data: { customizedParams: {} } } as any,
    );
  });

  it('renders a row for every one of the 7 widgets', async () => {
    const { container } = setupContainer();
    await container.setState({ currentHomeWidgets: {} });

    renderSetting(container);

    expect(screen.getAllByTestId(/^home-widget-row-/)).toHaveLength(7);
    expect(
      within(screen.getByTestId('home-widget-row-classroomPosts')).getByText(
        'admin:customize_settings.home_widget_labels.classroomPosts',
      ),
    ).toBeInTheDocument();
  });

  it('moves a widget down and persists the new order on save', async () => {
    const { container, changeSpy, updateSpy } = setupContainer();
    await container.setState({ currentHomeWidgets: {} });

    renderSetting(container);

    const searchRow = screen.getByTestId('home-widget-row-search');
    await userEvent.click(
      within(searchRow).getByRole('button', {
        name: 'admin:customize_settings.home_widgets_form.move_down',
      }),
    );
    await clickUpdate();

    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    const { homeWidgets } = savedArg(changeSpy);
    expect(homeWidgets.search.order).toBeGreaterThan(
      homeWidgets.recentUpdates.order,
    );
  });

  it('toggles a widget visibility and persists it on save', async () => {
    const { container, changeSpy, updateSpy } = setupContainer();
    await container.setState({ currentHomeWidgets: {} });

    renderSetting(container);

    const searchRow = screen.getByTestId('home-widget-row-search');
    await userEvent.click(within(searchRow).getByRole('checkbox'));
    await clickUpdate();

    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(savedArg(changeSpy).homeWidgets.search.visible).toBe(false);
  });

  it('adds a pinned page and persists it on save', async () => {
    const { container, changeSpy, updateSpy } = setupContainer();
    await container.setState({
      currentHomeWidgets: {},
      currentHomePinnedPages: [],
    });

    renderSetting(container);

    const pinnedRow = screen.getByTestId('home-widget-row-pinnedPages');
    await userEvent.click(
      within(pinnedRow).getByRole('button', {
        name: 'admin:customize_settings.home_widgets_form.expand_options',
      }),
    );
    await userEvent.click(
      within(pinnedRow).getByRole('button', {
        name: 'admin:customize_settings.home_widgets_form.add_pinned_page',
      }),
    );
    await userEvent.type(
      within(pinnedRow).getByLabelText(
        'admin:customize_settings.home_widgets_form.pinned_page_path',
      ),
      '/foo',
    );
    await clickUpdate();

    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(savedArg(changeSpy).homePinnedPages).toEqual([{ path: '/foo' }]);
  });

  it('blocks the save when a pinned path does not start with a slash', async () => {
    const { container, updateSpy } = setupContainer();
    await container.setState({
      currentHomeWidgets: {},
      currentHomePinnedPages: [],
    });

    renderSetting(container);

    const pinnedRow = screen.getByTestId('home-widget-row-pinnedPages');
    await userEvent.click(
      within(pinnedRow).getByRole('button', {
        name: 'admin:customize_settings.home_widgets_form.expand_options',
      }),
    );
    await userEvent.click(
      within(pinnedRow).getByRole('button', {
        name: 'admin:customize_settings.home_widgets_form.add_pinned_page',
      }),
    );
    await userEvent.type(
      within(pinnedRow).getByLabelText(
        'admin:customize_settings.home_widgets_form.pinned_page_path',
      ),
      'foo',
    );
    await clickUpdate();

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('sets the Classroom source path prefix and persists it on save', async () => {
    const { container, changeSpy, updateSpy } = setupContainer();
    await container.setState({
      currentHomeWidgets: {},
      currentHomeClassroomPathPrefix: null,
    });

    renderSetting(container);

    const classroomRow = screen.getByTestId('home-widget-row-classroomPosts');
    await userEvent.click(
      within(classroomRow).getByRole('button', {
        name: 'admin:customize_settings.home_widgets_form.expand_options',
      }),
    );
    await userEvent.type(
      within(classroomRow).getByLabelText(
        'admin:customize_settings.home_widgets_form.classroom_path_prefix',
      ),
      '/classroom-2026',
    );
    await clickUpdate();

    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(savedArg(changeSpy).homeClassroomPathPrefix).toBe('/classroom-2026');
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it('re-syncs the form when the container state changes', async () => {
    const { container } = setupContainer();
    await container.setState({ currentHomeWidgets: {} });

    renderSetting(container);
    expect(
      within(screen.getByTestId('home-widget-row-search')).getByRole(
        'checkbox',
      ),
    ).toBeChecked();

    await container.setState({
      currentHomeWidgets: { search: { visible: false, order: 10 } },
    });

    await waitFor(() =>
      expect(
        within(screen.getByTestId('home-widget-row-search')).getByRole(
          'checkbox',
        ),
      ).not.toBeChecked(),
    );
  });
});
