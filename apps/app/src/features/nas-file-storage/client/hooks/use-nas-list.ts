import type { SWRInfiniteKeyLoader, SWRInfiniteResponse } from 'swr/infinite';
import useSWRInfinite from 'swr/infinite';

import type {
  NasEntry,
  NasErrorCode,
  NasListPage,
} from '~/features/nas-file-storage/interfaces';
import axios from '~/utils/axios';

/** Server base for the NAS storage read/write API (apiv3). */
const NAS_API_ROOT = '/_api/v3/nas-storage';

/**
 * First element of every `useNasList` SWR cache key. Exported so the mutation
 * hook can revalidate a folder's listing with a key matcher without importing
 * SWR-Infinite key internals.
 */
export const NAS_LIST_ENDPOINT = '/nas-storage/entries';

/** Fixed page size for infinite scrolling; the route layer clamps to 1..500. */
const NAS_LIST_PAGE_SIZE = 100;

/**
 * Normalized client-side view of an `apiv3Err` body from the NAS storage API.
 * `message` is an i18n key (`nas_storage.error.*`); the numeric hints ride in
 * the response `info` slot per the API contract.
 */
export interface NasClientErrorShape {
  code: NasErrorCode;
  message: string;
  /** Present only for CONFLICT. */
  suggestedName?: string;
  /** Present only for TOO_LARGE. */
  limitBytes?: number;
  /** Present only for TOO_MANY_ENTRIES. */
  limitEntries?: number;
}

/**
 * Typed error thrown by every NAS client request. UI code catches this and
 * branches on `code` (e.g. CONFLICT -> offer overwrite/rename with
 * `suggestedName`). The apiv3 client helpers drop the response `info` slot, so
 * NAS requests go through `axios` directly and normalize here.
 */
export class NasRequestError extends Error implements NasClientErrorShape {
  code: NasErrorCode;

  suggestedName?: string;

  limitBytes?: number;

  limitEntries?: number;

  constructor(shape: NasClientErrorShape) {
    super(shape.message);
    this.name = 'NasRequestError';
    this.code = shape.code;
    this.suggestedName = shape.suggestedName;
    this.limitBytes = shape.limitBytes;
    this.limitEntries = shape.limitEntries;
  }
}

interface ApiV3ErrBody {
  errors?: { message?: string; code?: string }[];
  info?: Record<string, unknown>;
}

const toNasRequestError = (err: unknown): NasRequestError => {
  if (axios.isAxiosError(err) && err.response != null) {
    const body = (err.response.data ?? {}) as ApiV3ErrBody;
    const first = body.errors?.[0];
    const info = body.info ?? {};
    return new NasRequestError({
      code: (first?.code as NasErrorCode | undefined) ?? 'UNKNOWN',
      message: first?.message ?? 'nas_storage.error.unknown',
      ...(typeof info.suggestedName === 'string'
        ? { suggestedName: info.suggestedName }
        : {}),
      ...(typeof info.limitBytes === 'number'
        ? { limitBytes: info.limitBytes }
        : {}),
      ...(typeof info.limitEntries === 'number'
        ? { limitEntries: info.limitEntries }
        : {}),
    });
  }
  return new NasRequestError({
    code: 'UNKNOWN',
    message: 'nas_storage.error.unknown',
  });
};

type NasQueryValue = string | number | boolean | undefined;

/**
 * Single entry point for every NAS storage HTTP call. Normalizes failures to
 * `NasRequestError` so callers never see a raw axios error or a bare array.
 */
export const nasApiRequest = async <T>(
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string,
  opts: {
    params?: Record<string, NasQueryValue>;
    data?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<T> => {
  try {
    const res = await axios.request<T>({
      method,
      url: `${NAS_API_ROOT}${path}`,
      params: opts.params,
      data: opts.data,
      headers: opts.headers,
    });
    return res.data;
  } catch (err) {
    throw toNasRequestError(err);
  }
};

type NasListKey = [
  endpoint: string,
  dirPath: string,
  cursor: string | undefined,
  includeHidden: boolean,
  limit: number,
];

const fetchNasListPage = ([
  ,
  dirPath,
  cursor,
  includeHidden,
  limit,
]: NasListKey): Promise<NasListPage> =>
  nasApiRequest<NasListPage>('get', '/entries', {
    params: { path: dirPath, cursor, includeHidden, limit },
  });

export interface UseNasListResult {
  /** Entries of every page loaded so far, in server order. */
  entries: NasEntry[];
  /** Request the next page (no-op once the final page is loaded). */
  loadMore: () => void;
  /** True while the most recently loaded page reports a `nextCursor`. */
  hasMore: boolean;
  isLoading: boolean;
  error: NasRequestError | undefined;
  /**
   * Revalidate every loaded page against the server. Call after the folder
   * changes externally (Req 2.3) or after a mutation. The filesystem is the
   * source of truth — there is no client cache layer to invalidate.
   */
  reload: () => Promise<unknown>;
}

/**
 * Cursor-paged listing of one NAS folder for infinite scrolling. Changing
 * `dirPath` starts a fresh page series (new SWR key), so paging resets.
 */
export const useNasList = (
  dirPath: string,
  opts?: { includeHidden?: boolean },
): UseNasListResult => {
  const includeHidden = opts?.includeHidden ?? false;

  const getKey: SWRInfiniteKeyLoader<NasListPage, NasListKey | null> = (
    pageIndex,
    previousPage,
  ) => {
    if (
      pageIndex > 0 &&
      (previousPage == null || previousPage.nextCursor === undefined)
    ) {
      return null;
    }
    const cursor = pageIndex === 0 ? undefined : previousPage?.nextCursor;
    return [
      NAS_LIST_ENDPOINT,
      dirPath,
      cursor,
      includeHidden,
      NAS_LIST_PAGE_SIZE,
    ];
  };

  const swr: SWRInfiniteResponse<NasListPage, NasRequestError> = useSWRInfinite(
    getKey,
    fetchNasListPage,
    { revalidateFirstPage: false, revalidateAll: false },
  );

  const pages = swr.data ?? [];
  const entries = pages.flatMap((page) => page.entries);
  const lastPage = pages.at(-1);
  const hasMore = lastPage != null && lastPage.nextCursor !== undefined;

  return {
    entries,
    loadMore: () => {
      void swr.setSize((size) => size + 1);
    },
    hasMore,
    isLoading: swr.isLoading,
    error: swr.error,
    reload: () => swr.mutate(),
  };
};
