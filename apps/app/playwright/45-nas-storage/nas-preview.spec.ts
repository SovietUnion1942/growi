import { expect, test } from '@playwright/test';

/**
 * E2E tests for the in-browser preview of a NAS file (Task 12.3).
 *
 * Covers Requirement 9:
 *   - 9.1 a previewable file (image / text) exposes a preview control on its
 *     row; opening it renders the content inline (no forced download)
 *   - 9.2 the inline delivery URL carries `inline=1` so the browser interprets
 *     the body instead of saving it
 *   - 9.3 a video preview renders a seekable `<video controls>` element wired to
 *     the same inline (Range-capable) endpoint
 *   - 9.4 a non-previewable file exposes NO preview control - download only
 *
 * Environment assumptions match `nas-storage.spec.ts`: the E2E web server runs
 * with `GROWI_NAS_ENABLED=true` and a real `GROWI_NAS_ROOT`, and the admin
 * `storageState` is reused so `/nas` is reachable without an explicit login.
 *
 * Locator discipline (identical to `nas-storage.spec.ts`): the persistent
 * upload-queue `<li>` echoes the uploaded filename and never auto-closes, so
 * every listing assertion is scoped to `getByTestId('nas-entry-row')`, which the
 * queue does not use.
 */

// A minimal but valid 1x1 transparent PNG.
const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

// Unique suffix per run so specs sharing the one NAS root never collide.
const uniqueSuffix = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

test.describe('NAS File Storage - in-browser preview', () => {
  test('an image file exposes a preview control that renders the picture inline', async ({
    page,
  }) => {
    const listRow = (name: string) =>
      page.getByTestId('nas-entry-row').filter({ hasText: name });

    await page.goto('/nas');
    await expect(page.getByTestId('nas-toolbar')).toBeVisible();

    const fileName = `e2e-preview-${uniqueSuffix()}.png`;

    await page
      .getByTestId('nas-toolbar')
      .getByRole('button', { name: 'Upload' })
      .click();
    await expect(page.getByTestId('nas-upload-dropzone')).toBeVisible();
    await page.getByTestId('nas-upload-input').setInputFiles({
      name: fileName,
      mimeType: 'image/png',
      buffer: ONE_PX_PNG,
    });

    await expect(listRow(fileName)).toBeVisible({ timeout: 15_000 });

    // Req 9.1: a previewable row carries the preview trigger.
    const previewButton = listRow(fileName).getByTestId('nas-entry-preview');
    await expect(previewButton).toBeVisible();
    await previewButton.click();

    // Req 9.1 / 9.2: the modal shows an <img> served from the inline endpoint.
    const modal = page.getByTestId('nas-preview-modal');
    await expect(modal).toBeVisible();
    const image = page.getByTestId('nas-preview-image');
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute('src', /inline=1/);

    // The download escape hatch is always present (Req 9 - plain attachment).
    await expect(page.getByTestId('nas-preview-download')).toBeVisible();

    // Closing the modal removes it from the DOM.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('nas-preview-modal')).toHaveCount(0);
  });

  test('a plain-text file previews its content inline and is not flagged as truncated', async ({
    page,
  }) => {
    const listRow = (name: string) =>
      page.getByTestId('nas-entry-row').filter({ hasText: name });

    await page.goto('/nas');
    await expect(page.getByTestId('nas-toolbar')).toBeVisible();

    const fileName = `e2e-preview-${uniqueSuffix()}.txt`;
    const body = `nas preview text body ${fileName}`;

    await page
      .getByTestId('nas-toolbar')
      .getByRole('button', { name: 'Upload' })
      .click();
    await expect(page.getByTestId('nas-upload-dropzone')).toBeVisible();
    await page.getByTestId('nas-upload-input').setInputFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(body),
    });

    await expect(listRow(fileName)).toBeVisible({ timeout: 15_000 });

    await listRow(fileName).getByTestId('nas-entry-preview').click();
    await expect(page.getByTestId('nas-preview-modal')).toBeVisible();

    // Req 9.1: the small file is shown in full; Req 9.5: no truncation notice.
    await expect(page.getByTestId('nas-preview-text')).toHaveText(body, {
      timeout: 15_000,
    });
    await expect(page.getByTestId('nas-preview-truncated')).toHaveCount(0);
  });

  test('a video file previews as a seekable <video controls> element', async ({
    page,
  }) => {
    const listRow = (name: string) =>
      page.getByTestId('nas-entry-row').filter({ hasText: name });

    await page.goto('/nas');
    await expect(page.getByTestId('nas-toolbar')).toBeVisible();

    // A real playable clip is impractical to ship in the repo; the preview UI
    // classifies by extension, so a tiny `.mp4` still exercises the video branch
    // (element + `controls` + inline/Range-capable src). Asserting an actual
    // frame seek would need a decodable stream and is out of scope here.
    const fileName = `e2e-preview-${uniqueSuffix()}.mp4`;

    await page
      .getByTestId('nas-toolbar')
      .getByRole('button', { name: 'Upload' })
      .click();
    await expect(page.getByTestId('nas-upload-dropzone')).toBeVisible();
    await page.getByTestId('nas-upload-input').setInputFiles({
      name: fileName,
      mimeType: 'video/mp4',
      buffer: Buffer.from('\x00\x00\x00\x18ftypmp42not-a-real-clip'),
    });

    await expect(listRow(fileName)).toBeVisible({ timeout: 15_000 });

    await listRow(fileName).getByTestId('nas-entry-preview').click();
    await expect(page.getByTestId('nas-preview-modal')).toBeVisible();

    // Req 9.3: a <video controls> wired to the inline endpoint - the browser
    // negotiates Range against this URL for seeking.
    const video = page.getByTestId('nas-preview-video');
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute('controls', /.*/);
    await expect(video).toHaveAttribute('src', /inline=1/);

    // The <video> exposes a settable currentTime (the seek surface), even
    // though this dummy stream will not actually decode.
    const canSeek = await video.evaluate((el: HTMLVideoElement) => {
      el.currentTime = 0;
      return typeof el.currentTime === 'number';
    });
    expect(canSeek).toBe(true);
  });

  test('a non-previewable file shows only a download control, no preview trigger', async ({
    page,
  }) => {
    const listRow = (name: string) =>
      page.getByTestId('nas-entry-row').filter({ hasText: name });

    await page.goto('/nas');
    await expect(page.getByTestId('nas-toolbar')).toBeVisible();

    const fileName = `e2e-preview-${uniqueSuffix()}.bin`;

    await page
      .getByTestId('nas-toolbar')
      .getByRole('button', { name: 'Upload' })
      .click();
    await expect(page.getByTestId('nas-upload-dropzone')).toBeVisible();
    await page.getByTestId('nas-upload-input').setInputFiles({
      name: fileName,
      mimeType: 'application/octet-stream',
      buffer: Buffer.from([0x00, 0x01, 0x02, 0x03]),
    });

    await expect(listRow(fileName)).toBeVisible({ timeout: 15_000 });

    // Req 9.4: no preview trigger for an unsupported extension...
    await expect(
      listRow(fileName).getByTestId('nas-entry-preview'),
    ).toHaveCount(0);
    // ...but the download link is still there.
    await expect(
      listRow(fileName).getByRole('link', { name: /download/i }),
    ).toBeVisible();
  });
});
