import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LoadingSpinner } from '@growi/ui/dist/components';
import { useTranslation } from 'next-i18next';

import { useNasList } from '../hooks/use-nas-list';
import { NasEntryRow } from './NasEntryRow';

type Props = {
  /** Folder to open first. Defaults to the NAS root. */
  initialPath?: string;
};

const toSegments = (path: string): string[] => path.split('/').filter(Boolean);

const buildPath = (segments: string[]): string => `/${segments.join('/')}`;

/**
 * File browser for the NAS storage root: breadcrumb + toolbar + entry list with
 * infinite scroll. Owns the current folder path and drives `useNasList` with it;
 * opening a directory or a breadcrumb segment just moves that path. The listing
 * is re-validated against the filesystem via the toolbar refresh control so that
 * changes made outside GROWI show up on re-display (Req 2.3).
 */
export const NasStorageBrowser = ({
  initialPath = '/',
}: Props): JSX.Element => {
  const { t } = useTranslation();

  const [currentPath, setCurrentPath] = useState(initialPath);
  const { entries, loadMore, hasMore, isLoading, error, reload } =
    useNasList(currentPath);

  const segments = toSegments(currentPath);

  const handleOpenDir = useCallback((name: string) => {
    setCurrentPath((prev) => buildPath([...toSegments(prev), name]));
  }, []);

  // The hook returns a fresh `loadMore` identity on every render (new closure
  // over `swr.setSize`). Keeping it in a ref lets the observer effect depend on
  // stable signals only, so SWR state churn (validating -> data -> settled) does
  // not tear down and recreate the observer — which previously let a single
  // viewport intersection advance `setSize` more than once.
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  // Entry count at which we last called `loadMore`. Acts as an in-flight guard
  // without touching the hook: a repeated intersection at the same count is a
  // no-op, and the guard re-arms naturally once the next page grows the list.
  const lastRequestedLenRef = useRef(0);

  // A new folder starts a fresh page series in the hook; re-arm the guard during
  // render so the first intersection in the new folder is honoured.
  const guardedPathRef = useRef(currentPath);
  if (guardedPathRef.current !== currentPath) {
    guardedPathRef.current = currentPath;
    lastRequestedLenRef.current = 0;
  }

  const entriesLength = entries.length;
  const sentinelRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (el == null || !hasMore) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver((observerEntries) => {
      if (!observerEntries.some((e) => e.isIntersecting)) return;
      if (!hasMore) return;
      if (entriesLength <= lastRequestedLenRef.current) return;
      lastRequestedLenRef.current = entriesLength;
      loadMoreRef.current();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, entriesLength]);

  let body: JSX.Element;
  if (isLoading && entries.length === 0) {
    body = (
      <div className="text-muted text-center py-5" data-testid="nas-loading">
        <LoadingSpinner className="fs-3" />
      </div>
    );
  } else if (error != null) {
    body = (
      <div className="text-danger py-3" role="alert">
        {t(error.message)}
      </div>
    );
  } else if (entries.length === 0) {
    body = (
      <div className="text-muted text-center py-5">
        {t('nas_storage.empty_folder')}
      </div>
    );
  } else {
    body = (
      <ul className="list-group list-group-flush">
        {entries.map((entry) => (
          <NasEntryRow
            key={`${entry.type}:${entry.name}`}
            entry={entry}
            onOpenDir={handleOpenDir}
          />
        ))}
        {hasMore && (
          <li
            ref={sentinelRef}
            data-testid="nas-load-more-sentinel"
            className="list-group-item text-center text-muted small"
          >
            <LoadingSpinner className="me-1" />
            {t('nas_storage.loading_more')}
          </li>
        )}
      </ul>
    );
  }

  return (
    <div className="nas-storage-browser">
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb mb-2">
          <li className="breadcrumb-item">
            <button
              type="button"
              className="btn btn-link p-0 text-decoration-none"
              aria-label={t('nas_storage.breadcrumb_root')}
              onClick={() => setCurrentPath('/')}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                home
              </span>
            </button>
          </li>
          {segments.map((segment, index) => {
            const isLast = index === segments.length - 1;
            const targetPath = buildPath(segments.slice(0, index + 1));
            return (
              <li
                key={targetPath}
                className={`breadcrumb-item${isLast ? ' active' : ''}`}
              >
                {isLast ? (
                  <span aria-current="page">{segment}</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-link p-0 text-decoration-none"
                    onClick={() => setCurrentPath(targetPath)}
                  >
                    {segment}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <div
        className="nas-storage-browser__toolbar d-flex align-items-center gap-2 mb-2"
        data-testid="nas-toolbar"
      >
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          aria-label={t('nas_storage.refresh')}
          onClick={() => {
            void reload();
          }}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            refresh
          </span>
        </button>
      </div>

      {body}
    </div>
  );
};
