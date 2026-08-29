import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { NasEntry } from '~/features/nas-file-storage/interfaces';

import type { NasRequestError, UseNasListResult } from '../hooks/use-nas-list';
import { NasStorageBrowser } from './NasStorageBrowser';

const mocks = vi.hoisted(() => ({
  useNasList: vi.fn(),
  createFolder: vi.fn(),
  remove: vi.fn(),
  move: vi.fn(),
  rename: vi.fn(),
  uploadFile: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('../hooks/use-nas-list', () => ({ useNasList: mocks.useNasList }));

vi.mock('../hooks/use-nas-entry-actions', () => ({
  useNasEntryActions: () => ({
    createFolder: mocks.createFolder,
    remove: mocks.remove,
    move: mocks.move,
    rename: mocks.rename,
    uploadFile: mocks.uploadFile,
  }),
}));

vi.mock('../hooks/use-nas-confirm', () => ({
  useNasConfirm: () => ({
    confirm: mocks.confirm,
    dialogProps: {
      isOpen: false,
      message: '',
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    },
  }),
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en_US' },
  }),
}));

const fileEntry: NasEntry = {
  name: 'report.pdf',
  type: 'file',
  sizeBytes: 2048,
  modifiedAt: '2026-01-02T03:04:05Z',
};
const dirEntry: NasEntry = {
  name: 'documents',
  type: 'directory',
  sizeBytes: 0,
  modifiedAt: '2026-01-02T03:04:05Z',
};

const makeResult = (
  over: Partial<UseNasListResult> = {},
): UseNasListResult => ({
  entries: [],
  loadMore: vi.fn(),
  hasMore: false,
  isLoading: false,
  error: undefined,
  reload: vi.fn().mockResolvedValue(undefined),
  ...over,
});

let ioCallback: IntersectionObserverCallback | undefined;
const observe = vi.fn();
const disconnect = vi.fn();

beforeEach(() => {
  ioCallback = undefined;
  observe.mockClear();
  disconnect.mockClear();
  mocks.createFolder.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
  mocks.move.mockResolvedValue(undefined);
  mocks.confirm.mockResolvedValue(true);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IntersectionObserverCallback) {
        ioCallback = cb;
      }
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
      takeRecords = vi.fn();
      root = null;
      rootMargin = '';
      thresholds = [];
    },
  );
  mocks.useNasList.mockReturnValue(makeResult());
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('NasStorageBrowser', () => {
  it('renders entries (name, size) from the listing hook', () => {
    mocks.useNasList.mockReturnValue(
      makeResult({ entries: [fileEntry, dirEntry] }),
    );

    render(<NasStorageBrowser />);

    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByText('documents')).toBeInTheDocument();
    expect(screen.getByText('2.05 kB')).toBeInTheDocument();
  });

  it('opens a directory row and re-lists with the child path', async () => {
    mocks.useNasList.mockReturnValue(makeResult({ entries: [dirEntry] }));

    render(<NasStorageBrowser />);
    expect(mocks.useNasList).toHaveBeenLastCalledWith('/');

    await userEvent.click(screen.getByRole('button', { name: 'documents' }));

    expect(mocks.useNasList).toHaveBeenLastCalledWith('/documents');
  });

  it('navigates to an ancestor path from a breadcrumb segment', async () => {
    mocks.useNasList.mockReturnValue(makeResult({ entries: [] }));

    render(<NasStorageBrowser initialPath="/a/b/c" />);
    expect(mocks.useNasList).toHaveBeenLastCalledWith('/a/b/c');

    await userEvent.click(screen.getByRole('button', { name: 'a' }));

    expect(mocks.useNasList).toHaveBeenLastCalledWith('/a');
  });

  it('renders a load-more sentinel that calls loadMore on intersection', () => {
    const loadMore = vi.fn();
    mocks.useNasList.mockReturnValue(
      makeResult({ entries: [fileEntry], hasMore: true, loadMore }),
    );

    render(<NasStorageBrowser />);

    expect(screen.getByTestId('nas-load-more-sentinel')).toBeInTheDocument();
    expect(observe).toHaveBeenCalled();

    act(() => {
      ioCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(loadMore).toHaveBeenCalled();
  });

  const fireIntersection = () => {
    act(() => {
      ioCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
  };

  it('asks for the next page exactly once per intersection, even as the hook returns a fresh loadMore identity', () => {
    // The committed hook builds a new `loadMore` closure every render. Simulate
    // that between two intersections at the SAME entry count: the observer must
    // not re-fire because its identity changed.
    const loadMoreA = vi.fn();
    mocks.useNasList.mockReturnValue(
      makeResult({ entries: [fileEntry], hasMore: true, loadMore: loadMoreA }),
    );
    const { rerender } = render(<NasStorageBrowser />);

    fireIntersection();
    expect(loadMoreA).toHaveBeenCalledTimes(1);

    const loadMoreB = vi.fn();
    mocks.useNasList.mockReturnValue(
      makeResult({ entries: [fileEntry], hasMore: true, loadMore: loadMoreB }),
    );
    rerender(<NasStorageBrowser />);

    fireIntersection();
    expect(loadMoreB).not.toHaveBeenCalled();
    expect(loadMoreA).toHaveBeenCalledTimes(1);
  });

  it('re-arms and asks again once the next page has arrived', () => {
    const loadMore = vi.fn();
    mocks.useNasList.mockReturnValue(
      makeResult({ entries: [fileEntry], hasMore: true, loadMore }),
    );
    const { rerender } = render(<NasStorageBrowser />);

    fireIntersection();
    expect(loadMore).toHaveBeenCalledTimes(1);

    // Next page lands: the entry count grows, so the guard re-arms.
    mocks.useNasList.mockReturnValue(
      makeResult({
        entries: [fileEntry, dirEntry],
        hasMore: true,
        loadMore,
      }),
    );
    rerender(<NasStorageBrowser />);

    fireIntersection();
    expect(loadMore).toHaveBeenCalledTimes(2);
  });

  it('disconnects the IntersectionObserver on unmount', () => {
    mocks.useNasList.mockReturnValue(
      makeResult({ entries: [fileEntry], hasMore: true }),
    );
    const { unmount } = render(<NasStorageBrowser />);
    expect(observe).toHaveBeenCalled();

    unmount();

    expect(disconnect).toHaveBeenCalled();
  });

  it('does not render the sentinel when there is no next page', () => {
    mocks.useNasList.mockReturnValue(
      makeResult({ entries: [fileEntry], hasMore: false }),
    );

    render(<NasStorageBrowser />);

    expect(screen.queryByTestId('nas-load-more-sentinel')).toBeNull();
  });

  it('re-validates the listing when the refresh control is clicked (Req 2.3)', async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    mocks.useNasList.mockReturnValue(
      makeResult({ entries: [fileEntry], reload }),
    );

    render(<NasStorageBrowser />);
    await userEvent.click(
      screen.getByRole('button', { name: 'nas_storage.refresh' }),
    );

    expect(reload).toHaveBeenCalled();
  });

  it('renders a loading placeholder while the first page is in flight', () => {
    mocks.useNasList.mockReturnValue(makeResult({ isLoading: true }));

    render(<NasStorageBrowser />);

    expect(screen.getByTestId('nas-loading')).toBeInTheDocument();
  });

  it('renders the error message (an i18n key from the hook)', () => {
    // WHY: NasRequestError's constructor lives in the mocked hook module; the
    // component only reads `.message`, so a bare Error stands in here.
    const error = new Error('nas_storage.error.forbidden') as NasRequestError;
    mocks.useNasList.mockReturnValue(makeResult({ error }));

    render(<NasStorageBrowser />);

    expect(screen.getByText('nas_storage.error.forbidden')).toBeInTheDocument();
  });

  it('renders an empty-folder message when the folder has no entries', () => {
    mocks.useNasList.mockReturnValue(makeResult({ entries: [] }));

    render(<NasStorageBrowser />);

    expect(screen.getByText('nas_storage.empty_folder')).toBeInTheDocument();
  });

  describe('toolbar composition', () => {
    it('creates a folder from the New Folder control and closes the input', async () => {
      mocks.useNasList.mockReturnValue(makeResult({ entries: [] }));

      render(<NasStorageBrowser />);

      await userEvent.click(
        screen.getByRole('button', { name: 'nas_storage.new_folder' }),
      );
      await userEvent.type(
        screen.getByTestId('nas-new-folder-input'),
        'designs',
      );
      await userEvent.click(screen.getByTestId('nas-new-folder-submit'));

      expect(mocks.createFolder).toHaveBeenCalledWith('designs');
      // The hook self-revalidates on success — no explicit reload() here.
      expect(screen.queryByTestId('nas-new-folder-input')).toBeNull();
      expect(screen.queryByTestId('nas-action-error')).toBeNull();
    });

    it('reveals the upload dropzone from the Upload control', async () => {
      mocks.useNasList.mockReturnValue(makeResult({ entries: [] }));

      render(<NasStorageBrowser />);
      expect(screen.queryByTestId('nas-upload-dropzone')).toBeNull();

      await userEvent.click(
        screen.getByRole('button', { name: 'nas_storage.upload_button' }),
      );

      expect(screen.getByTestId('nas-upload-dropzone')).toBeInTheDocument();
    });
  });

  describe('row actions', () => {
    it('deletes a row only after the confirm dialog resolves true, with the recursive flag for a directory', async () => {
      mocks.useNasList.mockReturnValue(makeResult({ entries: [dirEntry] }));
      mocks.confirm.mockResolvedValue(true);

      render(<NasStorageBrowser />);
      await userEvent.click(
        screen.getByRole('button', { name: 'nas_storage.delete' }),
      );

      expect(mocks.confirm).toHaveBeenCalled();
      // `remove` self-revalidates the listing in the hook — no explicit reload().
      expect(mocks.remove).toHaveBeenCalledWith('/documents', true);
      expect(screen.queryByTestId('nas-action-error')).toBeNull();
    });

    it('does not delete when the confirm dialog resolves false', async () => {
      mocks.useNasList.mockReturnValue(makeResult({ entries: [fileEntry] }));
      mocks.confirm.mockResolvedValue(false);

      render(<NasStorageBrowser />);
      await userEvent.click(
        screen.getByRole('button', { name: 'nas_storage.delete' }),
      );

      expect(mocks.confirm).toHaveBeenCalled();
      expect(mocks.remove).not.toHaveBeenCalled();
    });

    it('moves without overwrite first, then confirms and retries with overwrite on CONFLICT', async () => {
      mocks.useNasList.mockReturnValue(makeResult({ entries: [fileEntry] }));
      mocks.move
        .mockRejectedValueOnce(
          Object.assign(new Error('conflict'), {
            code: 'CONFLICT',
          }),
        )
        .mockResolvedValueOnce(undefined);
      mocks.confirm.mockResolvedValue(true);

      render(<NasStorageBrowser />);
      await userEvent.click(
        screen.getByRole('button', { name: 'nas_storage.rename' }),
      );
      const input = screen.getByTestId('nas-rename-input');
      await userEvent.clear(input);
      await userEvent.type(input, 'renamed.pdf');
      await userEvent.click(screen.getByTestId('nas-rename-submit'));

      expect(mocks.move).toHaveBeenNthCalledWith(
        1,
        '/report.pdf',
        '/renamed.pdf',
      );
      expect(mocks.confirm).toHaveBeenCalled();
      expect(mocks.move).toHaveBeenNthCalledWith(
        2,
        '/report.pdf',
        '/renamed.pdf',
        true,
      );
      // move self-revalidates in the hook — no explicit reload().
      expect(screen.queryByTestId('nas-action-error')).toBeNull();
    });
  });

  describe('action error surfacing (Req 8.1, 8.3)', () => {
    const renameAndSubmit = async (to: string): Promise<void> => {
      await userEvent.click(
        screen.getByRole('button', { name: 'nas_storage.rename' }),
      );
      const input = screen.getByTestId('nas-rename-input');
      await userEvent.clear(input);
      await userEvent.type(input, to);
      await userEvent.click(screen.getByTestId('nas-rename-submit'));
    };

    it('surfaces a rejected remove in a role="alert" banner without an unhandled rejection', async () => {
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);
      mocks.useNasList.mockReturnValue(makeResult({ entries: [fileEntry] }));
      mocks.confirm.mockResolvedValue(true);
      mocks.remove.mockRejectedValue({
        code: 'STORAGE_UNAVAILABLE',
        message: 'nas_storage.error.storage_unavailable',
      });

      render(<NasStorageBrowser />);
      await userEvent.click(
        screen.getByRole('button', { name: 'nas_storage.delete' }),
      );

      const banner = await screen.findByRole('alert');
      expect(banner).toHaveTextContent('nas_storage.error.storage_unavailable');

      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).not.toHaveBeenCalled();
      process.off('unhandledRejection', unhandled);
    });

    it('dismisses the action error banner when the close control is clicked', async () => {
      mocks.useNasList.mockReturnValue(makeResult({ entries: [fileEntry] }));
      mocks.confirm.mockResolvedValue(true);
      mocks.remove.mockRejectedValue({
        code: 'STORAGE_UNAVAILABLE',
        message: 'nas_storage.error.storage_unavailable',
      });

      render(<NasStorageBrowser />);
      await userEvent.click(
        screen.getByRole('button', { name: 'nas_storage.delete' }),
      );
      expect(await screen.findByTestId('nas-action-error')).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole('button', { name: 'nas_storage.dismiss_error' }),
      );
      expect(screen.queryByTestId('nas-action-error')).toBeNull();
    });

    it('surfaces a rejected createFolder and closes the new-folder input', async () => {
      mocks.useNasList.mockReturnValue(makeResult({ entries: [] }));
      mocks.createFolder.mockRejectedValue({
        code: 'PERMISSION_DENIED',
        message: 'nas_storage.error.permission_denied',
      });

      render(<NasStorageBrowser />);
      await userEvent.click(
        screen.getByRole('button', { name: 'nas_storage.new_folder' }),
      );
      await userEvent.type(screen.getByTestId('nas-new-folder-input'), 'x');
      await userEvent.click(screen.getByTestId('nas-new-folder-submit'));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'nas_storage.error.permission_denied',
      );
      expect(screen.queryByTestId('nas-new-folder-input')).toBeNull();
    });

    it('surfaces a non-CONFLICT move rejection, closes the rename input, and does not throw', async () => {
      mocks.useNasList.mockReturnValue(makeResult({ entries: [fileEntry] }));
      mocks.move.mockRejectedValue({
        code: 'PERMISSION_DENIED',
        message: 'nas_storage.error.permission_denied',
      });

      render(<NasStorageBrowser />);
      await renameAndSubmit('renamed.pdf');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'nas_storage.error.permission_denied',
      );
      expect(screen.queryByTestId('nas-rename-input')).toBeNull();
      expect(mocks.move).toHaveBeenCalledTimes(1);
    });

    it('does not call move a second time when the overwrite confirm is declined', async () => {
      mocks.useNasList.mockReturnValue(makeResult({ entries: [fileEntry] }));
      mocks.move.mockRejectedValueOnce(
        Object.assign(new Error('conflict'), { code: 'CONFLICT' }),
      );
      mocks.confirm.mockResolvedValue(false);

      render(<NasStorageBrowser />);
      await renameAndSubmit('renamed.pdf');

      expect(mocks.move).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('nas-rename-input')).toBeNull();
      expect(screen.queryByTestId('nas-action-error')).toBeNull();
    });
  });
});
