import { expect, test } from '@playwright/test';

import { collapseSidebar } from '../utils';

/**
 * E2E tests for the NAS File Storage feature (`nas-file-storage`).
 *
 * Covers Task 6.2 scenarios:
 *   - login -> sidebar NAS nav item -> `/nas` browser -> upload a file ->
 *     it appears in the server-backed listing -> download it via the row control
 *   - create a folder; rename a file onto an existing name -> the destructive
 *     "overwrite" move goes through the confirm dialog -> old name disappears,
 *     new name remains
 *   - the sidebar nav item is present while the feature is enabled
 *
 * Environment assumptions:
 *   The E2E web server is started with `GROWI_NAS_ROOT` pointing at a real,
 *   writable directory (`playwright.config.ts` -> `webServer.env`), so the
 *   feature resolves to `ready`. The admin `storageState` is used; with
 *   `GROWI_NAS_GROUP` unset every logged-in user may access NAS storage.
 *
 *   The complementary "feature disabled" case lives in
 *   `nas-storage-disabled.spec.ts`.
 *
 * Locator discipline:
 *   `NasUploadDropzone` renders a persistent upload-queue `<li>` that ALSO
 *   carries `.list-group-item` and echoes the uploaded filename, and it never
 *   auto-closes. A bare `li.list-group-item` locator would therefore match the
 *   queue echo, producing false positives on "appears in listing" and a
 *   `toHaveCount(0)` that can never settle after a move. Every folder-listing
 *   locator here is derived from `getByTestId('nas-entry-row')` (the row `<li>`
 *   in `NasEntryRow.tsx`), which the upload queue does not use.
 */

const NAS_FILE_ENDPOINT = '/_api/v3/nas-storage/file';

// Unique suffix per run so specs sharing the one NAS root never collide.
const uniqueSuffix = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

test.describe('NAS File Storage - main user flows', () => {
  test('user reaches /nas from the sidebar, uploads a file, sees it listed, and downloads it', async ({
    page,
  }) => {
    // Folder-listing rows only (never the upload-queue echo).
    const listRow = (name: string) =>
      page.getByTestId('nas-entry-row').filter({ hasText: name });

    await page.goto('/');
    await collapseSidebar(page, false);

    // Sidebar nav item (rendered only when the feature is enabled and the
    // viewer is a real non-guest user - Requirement 1.2).
    const navItem = page.getByRole('link', { name: 'NAS Storage' });
    await expect(navItem).toBeVisible();
    await navItem.click();

    await expect(page).toHaveURL(/\/nas$/);
    await expect(page.getByTestId('nas-storage-page')).toBeVisible();
    await expect(page.getByTestId('nas-toolbar')).toBeVisible();

    // Upload a file through the dropzone input.
    const fileName = `e2e-upload-${uniqueSuffix()}.txt`;
    const fileBody = `nas e2e upload ${fileName}`;

    await page
      .getByTestId('nas-toolbar')
      .getByRole('button', { name: 'Upload' })
      .click();
    await expect(page.getByTestId('nas-upload-dropzone')).toBeVisible();
    await page.getByTestId('nas-upload-input').setInputFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(fileBody),
    });

    // Req 2.1: the entry shows up in the server-backed listing. After the upload
    // settles the browser calls `reload()` via `onUploaded`, so waiting on a
    // `nas-entry-row` (not the queue) genuinely observes the persisted row.
    await expect(listRow(fileName)).toBeVisible({ timeout: 15_000 });

    // Download it via the real per-row UI control (task 5.9): a file row renders
    // an `<a href="/_api/v3/nas-storage/file?path=..." download>` whose
    // accessible name comes from a visually-hidden `t('nas_storage.download')`
    // span. Directory rows have no such link.
    const downloadLink = listRow(fileName).getByRole('link', {
      name: /download/i,
    });
    await expect(downloadLink).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await downloadLink.click();
    const download = await downloadPromise;
    // Req 4.1: the download keeps the original filename.
    expect(download.suggestedFilename()).toBe(fileName);
    expect(await download.path()).not.toBeNull();
  });

  test('creating a folder works, and an overwrite move is gated by the confirm dialog', async ({
    page,
  }) => {
    const listRow = (name: string) =>
      page.getByTestId('nas-entry-row').filter({ hasText: name });

    await page.goto('/nas');
    await expect(page.getByTestId('nas-toolbar')).toBeVisible();

    // --- create a folder ---
    const folderName = `e2e-folder-${uniqueSuffix()}`;
    await page
      .getByTestId('nas-toolbar')
      .getByRole('button', { name: 'New folder' })
      .click();
    await page.getByTestId('nas-new-folder-input').fill(folderName);
    await page.getByTestId('nas-new-folder-submit').click();
    await expect(listRow(folderName)).toBeVisible({ timeout: 15_000 });

    // --- seed two files so a rename collides ---
    const suffix = uniqueSuffix();
    const srcName = `mv-src-${suffix}.txt`;
    const dstName = `mv-dst-${suffix}.txt`;

    const uploadOne = async (name: string, body: string): Promise<void> => {
      const uploadButton = page
        .getByTestId('nas-toolbar')
        .getByRole('button', { name: 'Upload' });
      // Open the dropzone if it is not already showing.
      if (!(await page.getByTestId('nas-upload-dropzone').isVisible())) {
        await uploadButton.click();
      }
      await expect(page.getByTestId('nas-upload-dropzone')).toBeVisible();
      await page.getByTestId('nas-upload-input').setInputFiles({
        name,
        mimeType: 'text/plain',
        buffer: Buffer.from(body),
      });
      // Wait on the server-backed row, not the upload-queue echo.
      await expect(listRow(name)).toBeVisible({ timeout: 15_000 });
    };

    await uploadOne(srcName, 'SRC-CONTENT');
    await uploadOne(dstName, 'DST-CONTENT');

    // --- rename src onto dst -> CONFLICT -> confirm dialog -> overwrite ---
    await listRow(srcName).getByRole('button', { name: 'Rename' }).click();
    await page.getByTestId('nas-rename-input').fill(dstName);
    await page.getByTestId('nas-rename-submit').click();

    // Destructive overwrite move must be confirmed (Req 5.6).
    const dialog = page.getByTestId('nas-confirm-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Yes' }).click();
    await expect(dialog).toBeHidden();

    // Old path gone from the listing, new path present (both listing-scoped).
    await expect(listRow(srcName)).toHaveCount(0, { timeout: 15_000 });
    await expect(listRow(dstName)).toBeVisible();

    // The destination now holds the source bytes.
    const res = await page.request.get(NAS_FILE_ENDPOINT, {
      params: { path: `/${dstName}` },
    });
    expect(res.status()).toBe(200);
    expect(await res.text()).toBe('SRC-CONTENT');
  });
});
