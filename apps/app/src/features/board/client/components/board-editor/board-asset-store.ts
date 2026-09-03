import type { TLAssetStore } from 'tldraw';

import { apiv3PostForm } from '~/client/util/apiv3-client';

/**
 * tldraw `TLAssetStore` for boards: every dropped / pasted / picker-uploaded
 * image is POSTed to `/_api/v3/board/assets` (GridFS) and referred to by a
 * relative URL. Without this, tldraw inlines images as base64 data URIs into
 * the Yjs document -- a few photos and the shared doc is multiple MB.
 *
 * `resolve` returns the stored `src` as-is: it is a same-origin relative URL,
 * so it works for every viewer and survives being shared through Yjs.
 */
export const boardAssetStore: TLAssetStore = {
  async upload(_asset, file) {
    const form = new FormData();
    form.append('file', file, file.name);
    const res = await apiv3PostForm<{ url: string }>('/board/assets', form);
    return { src: res.data.url };
  },
  resolve(asset) {
    return asset.props.src;
  },
};
