import { apiv3Get, apiv3Put } from '../util/apiv3-client';
import AdminCustomizeContainer from './AdminCustomizeContainer';

vi.mock('../util/apiv3-client');

const mockedApiv3Get = vi.mocked(apiv3Get);
const mockedApiv3Put = vi.mocked(apiv3Put);

describe('AdminCustomizeContainer - home notice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes the home notice fetched from GET /customize-setting/ as currentCustomizeHomeNotice', async () => {
    mockedApiv3Get.mockResolvedValue({
      data: {
        customizeParams: {
          customizeHomeNotice: '**Welcome** to the wiki',
        },
      },
    });

    const container = new AdminCustomizeContainer();
    await container.retrieveCustomizeData();

    expect(container.state.currentCustomizeHomeNotice).toBe(
      '**Welcome** to the wiki',
    );
  });

  it('updates currentCustomizeHomeNotice locally via changeCustomizeHomeNotice', async () => {
    const container = new AdminCustomizeContainer();

    container.changeCustomizeHomeNotice('new notice text');
    // Container.setState (unstated) resolves on the next microtask; flush it
    // before asserting, matching the update methods' own await ordering.
    await Promise.resolve();

    expect(container.state.currentCustomizeHomeNotice).toBe('new notice text');
  });

  it('saves the current home notice via PUT /customize-setting/customize-home-notice and reflects the response', async () => {
    mockedApiv3Put.mockResolvedValue({
      data: {
        customizedParams: { customizeHomeNotice: 'saved notice' },
      },
    });

    const container = new AdminCustomizeContainer();
    await container.setState({ currentCustomizeHomeNotice: 'saved notice' });

    await container.updateCustomizeHomeNotice();

    expect(mockedApiv3Put).toHaveBeenCalledWith(
      '/customize-setting/customize-home-notice',
      { customizeHomeNotice: 'saved notice' },
    );
    expect(container.state.currentCustomizeHomeNotice).toBe('saved notice');
  });

  it('rethrows and logs on update failure without corrupting local state', async () => {
    mockedApiv3Put.mockRejectedValue(new Error('network error'));

    const container = new AdminCustomizeContainer();
    await container.setState({ currentCustomizeHomeNotice: 'unsaved notice' });

    await expect(container.updateCustomizeHomeNotice()).rejects.toThrow(
      'Failed to update data',
    );
    expect(container.state.currentCustomizeHomeNotice).toBe('unsaved notice');
  });
});

describe('AdminCustomizeContainer - site-common home widgets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes the 3 site-common home widget settings fetched from GET /customize-setting/', async () => {
    mockedApiv3Get.mockResolvedValue({
      data: {
        customizeParams: {
          homeWidgets: { search: { visible: false } },
          homePinnedPages: [{ path: '/x' }],
          homeClassroomPathPrefix: '/cr',
        },
      },
    });

    const container = new AdminCustomizeContainer();
    await container.retrieveCustomizeData();

    expect(container.state.currentHomeWidgets).toEqual({
      search: { visible: false },
    });
    expect(container.state.currentHomePinnedPages).toEqual([{ path: '/x' }]);
    expect(container.state.currentHomeClassroomPathPrefix).toBe('/cr');
  });

  it('falls back to empty defaults when the 3 keys are absent from the response', async () => {
    mockedApiv3Get.mockResolvedValue({
      data: {
        customizeParams: {},
      },
    });

    const container = new AdminCustomizeContainer();
    await container.retrieveCustomizeData();

    expect(container.state.currentHomeWidgets).toEqual({});
    expect(container.state.currentHomePinnedPages).toEqual([]);
    expect(container.state.currentHomeClassroomPathPrefix).toBeNull();
  });

  it('changeHomeWidgetsSettings updates only the provided state field', async () => {
    const container = new AdminCustomizeContainer();
    await container.setState({
      currentHomeWidgets: { search: { visible: true } },
      currentHomePinnedPages: [],
      currentHomeClassroomPathPrefix: null,
    });

    container.changeHomeWidgetsSettings({ homePinnedPages: [{ path: '/a' }] });
    await Promise.resolve();

    expect(container.state.currentHomePinnedPages).toEqual([{ path: '/a' }]);
    expect(container.state.currentHomeWidgets).toEqual({
      search: { visible: true },
    });
    expect(container.state.currentHomeClassroomPathPrefix).toBeNull();
  });

  it('saves the 3 values together via PUT /customize-setting/home-widgets and reflects the response', async () => {
    mockedApiv3Put.mockResolvedValue({
      data: {
        customizedParams: {
          homeWidgets: { search: { visible: false } },
          homePinnedPages: [{ path: '/saved' }],
          homeClassroomPathPrefix: '/classroom',
        },
      },
    });

    const container = new AdminCustomizeContainer();
    await container.setState({
      currentHomeWidgets: { search: { visible: false } },
      currentHomePinnedPages: [{ path: '/saved' }],
      currentHomeClassroomPathPrefix: '/classroom',
    });

    await container.updateHomeWidgets();

    expect(mockedApiv3Put).toHaveBeenCalledWith(
      '/customize-setting/home-widgets',
      {
        homeWidgets: { search: { visible: false } },
        homePinnedPages: [{ path: '/saved' }],
        homeClassroomPathPrefix: '/classroom',
      },
    );
    expect(container.state.currentHomeWidgets).toEqual({
      search: { visible: false },
    });
    expect(container.state.currentHomePinnedPages).toEqual([
      { path: '/saved' },
    ]);
    expect(container.state.currentHomeClassroomPathPrefix).toBe('/classroom');
  });

  it('rethrows and logs on updateHomeWidgets failure without corrupting local state', async () => {
    mockedApiv3Put.mockRejectedValue(new Error('network error'));

    const container = new AdminCustomizeContainer();
    await container.setState({
      currentHomePinnedPages: [{ path: '/unsaved' }],
    });

    await expect(container.updateHomeWidgets()).rejects.toThrow(
      'Failed to update data',
    );
    expect(container.state.currentHomePinnedPages).toEqual([
      { path: '/unsaved' },
    ]);
  });
});
