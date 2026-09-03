import { createReadStream } from 'node:fs';
import type { Readable } from 'node:stream';
import { GridFSBucket, ObjectId } from 'mongodb';
import mongoose from 'mongoose';

const BUCKET_NAME = 'boardAssets';

type BoardAssetMeta = {
  contentType: string;
  filename: string;
  length: number;
  uploadedBy: string;
};

const getBucket = (): GridFSBucket =>
  new GridFSBucket(mongoose.connection.db as never, {
    bucketName: BUCKET_NAME,
  });

/**
 * Stores board images (drag-drop / paste / picker uploads) in a dedicated
 * GridFS bucket. Independent of GROWI attachments (which are page-bound) and
 * of the NAS feature -- a board has neither a page nor a NAS root, so it gets
 * its own store, gated only by `BOARD_MODE`.
 */
export const boardAssetStore = {
  /** Streams a multer temp file into GridFS; returns the new asset id. */
  put(
    tmpPath: string,
    filename: string,
    contentType: string,
    uploadedBy: string,
  ): Promise<string> {
    const bucket = getBucket();
    return new Promise((resolve, reject) => {
      const id = new ObjectId();
      const upload = bucket.openUploadStreamWithId(id, filename, {
        contentType,
        metadata: { uploadedBy, contentType },
      });
      createReadStream(tmpPath)
        .pipe(upload)
        .on('error', reject)
        .on('finish', () => resolve(id.toHexString()));
    });
  },

  async stat(id: string): Promise<BoardAssetMeta | null> {
    if (!ObjectId.isValid(id)) return null;
    const bucket = getBucket();
    const [file] = await bucket
      .find({ _id: new ObjectId(id) })
      .limit(1)
      .toArray();
    if (file == null) return null;
    return {
      contentType:
        (file.metadata?.contentType as string) ??
        file.contentType ??
        'application/octet-stream',
      filename: file.filename,
      length: file.length,
      uploadedBy: (file.metadata?.uploadedBy as string) ?? '',
    };
  },

  openDownloadStream(id: string): Readable {
    return getBucket().openDownloadStream(new ObjectId(id));
  },
};
