import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * E2E test for the large-file chunked upload path (Task 12.3).
 *
 * Covers Requirement 10:
 *   - 10.1 a single file larger than the one-request limit is received in
 *     several parts and persisted byte-for-byte under the NAS root
 *   - 10.2 only the fully-received file becomes visible in the listing; no
 *     partial `.part` artifact is shown
 *
 * The dropzone routes a file to the chunked protocol when its size exceeds
 * `CHUNK_UPLOAD_THRESHOLD_BYTES = 90 MiB` (hard-coded in
 * `use-nas-chunked-upload.ts` - there is no env lever). So a genuine
 * end-to-end exercise of that path needs a >90 MiB file: this spec generates a
 * 91 MiB temp file and is marked `test.slow()`. The chunk-routing decision and
 * the resume-from-scratch behaviour are unit-covered (tasks 11.4 / 11.5); this
 * spec proves the happy path survives the full browser -> apiv3 -> filesystem
 * round trip.
 *
 * Environment assumptions match `nas-storage.spec.ts` (feature enabled, real
 * `GROWI_NAS_ROOT`, admin `storageState`). Note: `GROWI_NAS_MAX_FILE_SIZE` must
 * stay unset (or above ~91 MiB) for this spec - a lower hard cap would reject
 * the file with `TOO_LARGE` before the chunked path completes.
 */

const NAS_FILE_ENDPOINT = '/_api/v3/nas-storage/file';

// Just over the 90 MiB chunked-upload threshold.
const LARGE_FILE_BYTES = 91 * 1024 * 1024;

const uniqueSuffix = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

test.describe('NAS File Storage - large-file chunked upload', () => {
  test('a >90 MiB file uploads via the chunked path and appears complete in the listing', async ({
    page,
  }) => {
    // Generating + streaming ~91 MiB through the browser is well over the
    // default per-test budget.
    test.slow();

    const listRow = (name: string) =>
      page.getByTestId('nas-entry-row').filter({ hasText: name });

    // `setInputFiles(path)` uses the file's real basename as the upload name, so
    // this unique basename is also the name asserted on in the listing.
    const tmpPath = path.join(os.tmpdir(), `e2e-chunked-${uniqueSuffix()}.bin`);
    const fileName = path.basename(tmpPath);
    // A deterministic, non-zero fill so a byte-for-byte size check is meaningful.
    fs.writeFileSync(tmpPath, Buffer.alloc(LARGE_FILE_BYTES, 0x5a));

    try {
      await page.goto('/nas');
      await expect(page.getByTestId('nas-toolbar')).toBeVisible();

      await page
        .getByTestId('nas-toolbar')
        .getByRole('button', { name: 'Upload' })
        .click();
      await expect(page.getByTestId('nas-upload-dropzone')).toBeVisible();
      await page.getByTestId('nas-upload-input').setInputFiles(tmpPath);

      // Wait for the queue item to reach a terminal "done" state, then assert
      // on the persisted listing row.
      const queueItem = page
        .getByTestId('nas-upload-item')
        .filter({ hasText: fileName });
      await expect(queueItem).toContainText(/done/i, { timeout: 120_000 });

      // Req 10.2: only the finished file shows up - and under its real name,
      // never a `.part` scratch name.
      const row = listRow(fileName);
      await expect(row).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByTestId('nas-entry-row').filter({ hasText: '.part' }),
      ).toHaveCount(0);

      // Req 10.1: the persisted file is the same size as the source.
      const res = await page.request.get(NAS_FILE_ENDPOINT, {
        params: { path: `/${fileName}` },
      });
      expect(res.status()).toBe(200);
      const contentLength = res.headers()['content-length'];
      expect(contentLength).toBe(String(LARGE_FILE_BYTES));
    } finally {
      fs.rmSync(tmpPath, { force: true });
    }
  });
});
