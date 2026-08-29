import { expect, test } from '@playwright/test';

import { collapseSidebar } from '../utils';

/**
 * Task 6.2 scenario: when `GROWI_NAS_ROOT` is unset the feature leaves no
 * reachable UI surface - no sidebar nav item and `/nas` behaves as 404
 * (Requirement 1.2).
 *
 * This needs the web server started WITHOUT `GROWI_NAS_ROOT`, i.e. a second
 * server configuration. Playwright's single `webServer` block (shared by every
 * project, and in CI driven through `GROWI_WEBSERVER_COMMAND`) cannot express a
 * per-suite server env, and the E2E server here is deliberately started WITH the
 * var so the enabled flows can run. Running two GROWI servers on distinct ports
 * for one assertion is out of scope for this task.
 *
 * The negative behaviour is already covered at lower levels:
 *   - `src/pages/nas/nas-page-gate.spec.ts` - `/nas` getServerSideProps returns
 *     `{ notFound: true }` when `crowi.isNasStorageReady()` is false
 *   - `src/features/nas-file-storage/client/nav/NasStorageNavItem.spec.tsx` -
 *     the nav item renders `null` when `nasStorageEnabledAtom` is false
 *   - `src/features/nas-file-storage/server/routes/*.integ.ts` - every endpoint
 *     is 404 while the feature is not ready
 */
test.describe('NAS File Storage - feature disabled', () => {
  test.skip(
    true,
    'Requires a second web server started without GROWI_NAS_ROOT; not expressible with the shared single webServer config. Covered by nas-page-gate.spec.ts / NasStorageNavItem.spec.tsx / route *.integ.ts.',
  );

  test('no sidebar nav item and /nas is 404 when GROWI_NAS_ROOT is unset', async ({
    page,
  }) => {
    await page.goto('/');
    await collapseSidebar(page, false);
    await expect(page.getByRole('link', { name: 'NAS Storage' })).toHaveCount(
      0,
    );

    const res = await page.goto('/nas');
    expect(res?.status()).toBe(404);
  });
});
