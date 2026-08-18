import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';

import { useFetchCurrentPage, useIsIdenticalPath } from '~/states/page';
import { useSetEditingMarkdown } from '~/states/ui/editor';

/**
 * Hook for handling SAME_ROUTE client-side navigation within [[...path]] route.
 *
 * Responsibilities:
 * - Detects path changes during SAME_ROUTE CSR navigation
 * - Fetches page data when navigating to a different page within the same route
 * - Updates editing markdown state with fetched content
 *
 * Note: FROM_OUTSIDE initial navigation is handled by useInitialCSRFetch.
 *
 * This hook uses useRef to track the previous path, enabling detection of
 * client-side navigations. On initial render (including FROM_OUTSIDE),
 * previousPathRef is null, so no fetch is triggered.
 */
export const useSameRouteNavigation = (): void => {
  const router = useRouter();
  // eslint-disable-next-line no-console
  console.log('[DEBUG useSameRouteNavigation] RENDER, router.asPath=', router.asPath);
  const previousPathRef = useRef<string | null>(null);

  const isIdenticalPath = useIsIdenticalPath();
  const { fetchCurrentPage } = useFetchCurrentPage();
  const setEditingMarkdown = useSetEditingMarkdown();

  useEffect(() => {
    const currentPath = router.asPath;
    const previousPath = previousPathRef.current;

    // eslint-disable-next-line no-console
    console.log(
      '[DEBUG useSameRouteNavigation] effect run, previousPath=',
      previousPath,
      'currentPath=',
      currentPath,
      'isIdenticalPath=',
      isIdenticalPath,
    );

    // Update ref for next render
    previousPathRef.current = currentPath;

    // Skip on initial render (SSR data is already available)
    if (previousPath === null) {
      // eslint-disable-next-line no-console
      console.log('[DEBUG useSameRouteNavigation] skip: initial render');
      return;
    }

    // Skip if path hasn't changed
    if (previousPath === currentPath) {
      // eslint-disable-next-line no-console
      console.log('[DEBUG useSameRouteNavigation] skip: path unchanged');
      return;
    }

    // Skip if this is an identical path page
    if (isIdenticalPath) {
      // eslint-disable-next-line no-console
      console.log('[DEBUG useSameRouteNavigation] skip: isIdenticalPath');
      return;
    }

    // eslint-disable-next-line no-console
    console.log('[DEBUG useSameRouteNavigation] fetching page data for', currentPath);

    // CSR navigation detected - fetch page data
    const fetch = async () => {
      try {
        const pageData = await fetchCurrentPage({ path: currentPath });
        // eslint-disable-next-line no-console
        console.log('[DEBUG useSameRouteNavigation] fetchCurrentPage resolved', pageData);
        if (pageData?.revision?.body != null) {
          setEditingMarkdown(pageData.revision.body);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.log('[DEBUG useSameRouteNavigation] fetchCurrentPage threw', err);
      }
    };

    fetch();
  }, [router.asPath, isIdenticalPath, fetchCurrentPage, setEditingMarkdown]);
};
