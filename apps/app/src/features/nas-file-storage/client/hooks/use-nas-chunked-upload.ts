import { useCallback, useMemo } from 'react';

import type {
  BeginChunkedUploadResponse,
  NasEntry,
} from '~/features/nas-file-storage/interfaces';

import { NasRequestError, nasApiRequest } from './use-nas-list';

/**
 * Files at or below this size go through the ordinary single-shot `POST /files`
 * path; larger files are sliced and streamed via the chunked-upload protocol
 * (`POST /uploads` -> sequential `PUT /uploads/:id` -> `POST
 * /uploads/:id/complete`). The default (90 MiB) stays safely inside a typical
 * 100 MiB reverse-proxy / CDN request-body limit. Exported so the dropzone
 * (task 11.5) picks the same threshold when routing each queued file.
 */
export const CHUNK_UPLOAD_THRESHOLD_BYTES = 90 * 1024 * 1024;

/** True when `size` exceeds the threshold and must use the chunked path. */
export const shouldUseChunkedUpload = (size: number): boolean =>
  size > CHUNK_UPLOAD_THRESHOLD_BYTES;

export interface UploadLargeFileOptions {
  /** Destination file name; defaults to `file.name`. */
  name?: string;
  /** Allow overwriting an existing destination file on completion. */
  overwrite?: boolean;
  /** Called after each chunk is acknowledged with cumulative progress. */
  onProgress?: (sentBytes: number, totalBytes: number) => void;
}

export interface UseNasChunkedUploadResult {
  /**
   * Upload one large file into the current folder via the chunked protocol.
   * Rejects with a `NasRequestError` on failure (same shape as
   * `useNasEntryActions().uploadFile`): `TOO_LARGE` carries `limitBytes`,
   * `CONFLICT` carries `suggestedName`. A mid-stream failure aborts the server
   * session (`DELETE /uploads/:id`, best-effort) so no orphan `.part` remains.
   */
  uploadLargeFile: (
    file: File,
    opts?: UploadLargeFileOptions,
  ) => Promise<NasEntry>;
}

/** Max number of automatic "restart from scratch" attempts on CHUNK_OUT_OF_ORDER. */
const MAX_OUT_OF_ORDER_RETRIES = 1;

/**
 * Client half of the single-file chunked upload protocol (Requirement 10).
 *
 * On `CHUNK_OUT_OF_ORDER` (client/server byte-offset desync) the whole upload is
 * restarted once from a fresh session, per Req 10.4 ("再実行は最初からやり直し").
 * Any other chunk failure aborts the session and rejects; the dropzone queue
 * (task 11.5) owns the user-facing retry UX for those.
 */
export const useNasChunkedUpload = (
  currentDirPath: string,
): UseNasChunkedUploadResult => {
  const uploadLargeFile = useCallback(
    (file: File, opts?: UploadLargeFileOptions): Promise<NasEntry> => {
      const targetName = opts?.name ?? file.name;
      const totalBytes = file.size;
      const overwrite = opts?.overwrite ?? false;

      const abortSession = async (uploadId: string): Promise<void> => {
        try {
          await nasApiRequest<{ ok: true }>('delete', `/uploads/${uploadId}`);
        } catch {
          // best-effort: the TTL sweep reaps the session/.part otherwise
        }
      };

      const runOnce = async (attempt: number): Promise<NasEntry> => {
        // A begin failure creates no session, so there is nothing to clean up.
        const { uploadId, chunkSize }: BeginChunkedUploadResponse =
          await nasApiRequest<BeginChunkedUploadResponse>('post', '/uploads', {
            data: {
              dir: currentDirPath,
              name: targetName,
              totalBytes,
              overwrite,
            },
          });

        try {
          for (let offset = 0; offset < totalBytes; offset += chunkSize) {
            const end = Math.min(offset + chunkSize, totalBytes);
            const blob = file.slice(offset, end);
            // biome-ignore lint/performance/noAwaitInLoops: chunks MUST be sent sequentially -- the server accepts a PATCH only when its Content-Range start equals the bytes received so far (design: "Content-Range 逐次追記").
            await nasApiRequest<void>('put', `/uploads/${uploadId}`, {
              data: blob,
              headers: {
                'Content-Range': `bytes ${offset}-${end - 1}/${totalBytes}`,
                'Content-Type': 'application/octet-stream',
              },
            });
            opts?.onProgress?.(end, totalBytes);
          }
        } catch (err) {
          await abortSession(uploadId);
          if (
            err instanceof NasRequestError &&
            err.code === 'CHUNK_OUT_OF_ORDER' &&
            attempt < MAX_OUT_OF_ORDER_RETRIES
          ) {
            return runOnce(attempt + 1);
          }
          throw err;
        }

        // The server consumes (and drops) the session on complete, so a
        // failure here -- CONFLICT included -- needs no explicit abort.
        return nasApiRequest<NasEntry>(
          'post',
          `/uploads/${uploadId}/complete`,
          {},
        );
      };

      return runOnce(0);
    },
    [currentDirPath],
  );

  return useMemo(() => ({ uploadLargeFile }), [uploadLargeFile]);
};
