import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { NasEntry } from '~/features/nas-file-storage/interfaces';

import type { NasRequestError, UseNasListResult } from '../hooks/use-nas-list';
import { NasStorageBrowser } from './NasStorageBrowser';

const mocks = vi.hoisted(() => ({ useNasList: vi.fn() }));

vi.mock('../hooks/use-nas-list', () => ({ useNasList: mocks.useNasList }));

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
});
