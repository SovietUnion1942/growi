import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * E2E test for the folder (sub-tree) bulk upload (Task 12.3).
 *
 * Covers Requirement 11:
 *   - 11.1 a folder that contains sub-folders is recreated under the current
 *     folder, every file landing at its matching path
 *   - 11.2 the batch conflict policy is asked exactly once, before anything is
 *     written, and (here) applied as "overwrite" to the whole batch
 *   - 11.3 the reproduced tree is navigable (folder -> sub-folder -> file)
 *
 * Driving notes:
 *   The "select folder" button (`nas-folder-select`) opens either the OS folder
 *   picker or the File System Access API (`showDirectoryPicker`) - neither is
 *   drivable from Playwright. The test therefore targets the hidden
 *   `<input webkitdirectory>` (`nas-folder-input`) directly with
 *   `setInputFiles(<dir>)`, which is exactly what the button's non-Chromium
 *   fallback path uses; Playwright fills in `webkitRelativePath` from the real
 *   on-disk tree.
 *
 *   Empty sub-folders (Req 11.2) cannot be exercised this way - a
 *   `webkitdirectory` input only yields files, so an empty directory never
 *   reaches the browser. That path (Chromium's `showDirectoryPicker`) is not
 *   E2E-drivable and is covered by `walkSelection` unit tests.
 *
 * Environment assumptions match `nas-storage.spec.ts` (feature enabled, real
 * `GROWI_NAS_ROOT`, admin `storageState`).
 */

const uniqueSuffix = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

test.describe('NAS File Storage - folder bulk upload', () => {
  test('a folder with a sub-folder is reproduced as a navigable tree, policy asked once', async ({
    page,
  }) => {
    const listRow = (name: string) =>
      page.getByTestId('nas-entry-row').filter({ hasText: name });

    // --- build a small on-disk tree: <top>/f1.txt, <top>/sub/f2.txt ---
    const topName = `e2e-folderup-${uniqueSuffix()}`;
    const stageDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'growi-e2e-folderup-'),
    );
    const topDir = path.join(stageDir, topName);
    fs.mkdirSync(path.join(topDir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(topDir, 'f1.txt'), 'F1 CONTENT');
    fs.writeFileSync(path.join(topDir, 'sub', 'f2.txt'), 'F2 CONTENT');

    try {
      await page.goto('/nas');
      await expect(page.getByTestId('nas-toolbar')).toBeVisible();

      // Reveal the dropzone (the folder input lives inside it).
      await page
        .getByTestId('nas-toolbar')
        .getByRole('button', { name: 'Upload' })
        .click();
      await expect(page.getByTestId('nas-upload-dropzone')).toBeVisible();

      // Feed the whole directory to the hidden webkitdirectory input.
      await page.getByTestId('nas-folder-input').setInputFiles(topDir);

      // Req 11.3: the batch conflict-policy chooser appears exactly once,
      // before any upload starts.
      const policyDialog = page.getByTestId('nas-batch-policy-dialog');
      await expect(policyDialog).toBeVisible();
      await expect(policyDialog).toHaveCount(1);
      await page.getByTestId('nas-batch-policy-overwrite').click();
      await expect(page.getByTestId('nas-batch-policy-dialog')).toHaveCount(0);

      // The batch runs; wait for the busy indicator to clear and a summary.
      await expect(page.getByTestId('nas-folder-upload-busy')).toHaveCount(0, {
        timeout: 60_000,
      });
      await expect(page.getByTestId('nas-folder-upload-summary')).toBeVisible({
        timeout: 60_000,
      });
      // No per-file failures expected on a clean run.
      await expect(page.getByTestId('nas-folder-upload-failures')).toHaveCount(
        0,
      );

      // Req 11.1: the top folder is recreated under the current folder.
      await expect(listRow(topName)).toBeVisible({ timeout: 15_000 });

      // Req 11.3: navigate into it (client-side path state, no URL change) ->
      // f1.txt + the sub-folder are present, and the breadcrumb tracks the path.
      const breadcrumb = page.getByRole('navigation', { name: 'breadcrumb' });
      await listRow(topName).getByRole('button', { name: topName }).click();
      await expect(breadcrumb).toContainText(topName);
      await expect(listRow('f1.txt')).toBeVisible({ timeout: 15_000 });
      await expect(listRow('sub')).toBeVisible();

      // ...and into the sub-folder -> f2.txt is present (tree depth preserved).
      await listRow('sub').getByRole('button', { name: 'sub' }).click();
      await expect(breadcrumb).toContainText('sub');
      await expect(listRow('f2.txt')).toBeVisible({ timeout: 15_000 });
    } finally {
      fs.rmSync(stageDir, { recursive: true, force: true });
    }
  });
});
