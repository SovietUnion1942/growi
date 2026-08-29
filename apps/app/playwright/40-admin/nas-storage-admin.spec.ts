import { expect, test } from '@playwright/test';

/**
 * E2E test for the admin NAS File Storage status panel (`/admin/nas-storage`).
 *
 * Covers Task 6.2 scenario:
 *   - the admin status section renders the feature-enabled state and the
 *     root-resolution result, including - when the root is misconfigured - the
 *     concrete reason (Requirements 1.3, 1.4)
 *
 * Environment note:
 *   The E2E web server sets `GROWI_NAS_ROOT` to a real writable directory
 *   (`playwright.config.ts`), so the expected steady state here is `Ready`. A
 *   genuinely `Misconfigured` root would require starting the server with a
 *   broken path, which the shared `webServer` config cannot do. Following the
 *   pattern of `vault-reconcile-admin.spec.ts`, this test accepts any of the
 *   valid rendered states and, when the state IS `Misconfigured`, asserts that
 *   one of the known i18n reason strings is shown.
 */

// public/static/locales/en_US/translation.json -> nas_storage.admin.reason.*
const KNOWN_MISCONFIGURED_REASONS = [
  'The configured directory does not exist.',
  'The configured path is not a directory.',
  'The configured directory is not writable.',
];

test.describe('Admin NAS Storage status', () => {
  test('admin sees the NAS storage status panel with the root-resolution result', async ({
    page,
  }) => {
    await page.goto('/admin/nas-storage');

    const panel = page.getByTestId('nas-admin-status');
    await expect(panel).toBeVisible();

    // The loading spinner resolves into either the status table or a fetch
    // error alert - assert the panel settles rather than hanging.
    await expect(page.getByTestId('nas-admin-status-loading')).toHaveCount(0, {
      timeout: 15_000,
    });

    // Enabled/disabled badge is rendered.
    await expect(panel.getByText(/^(Enabled|Disabled)$/)).toBeVisible();

    // Root-resolution row shows one of the four known states.
    const rootStateBadge = panel
      .getByText(/^(Ready|Unavailable|Misconfigured|Not configured)$/)
      .first();
    await expect(rootStateBadge).toBeVisible();

    const rootState = (await rootStateBadge.innerText()).trim();
    if (rootState === 'Misconfigured') {
      const panelText = await panel.innerText();
      const matched = KNOWN_MISCONFIGURED_REASONS.some((reason) =>
        panelText.includes(reason),
      );
      expect(
        matched,
        `Misconfigured state without a known reason string. Panel text:\n${panelText}`,
      ).toBeTruthy();
    }
  });
});
