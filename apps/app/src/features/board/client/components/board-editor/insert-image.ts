import { AssetRecordType, type Editor } from 'tldraw';

const loadDimensions = (url: string): Promise<{ w: number; h: number }> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 320, h: 240 });
    img.src = url;
  });

const MAX_INITIAL = 900;

/**
 * Places an already-hosted image (a GROWI attachment URL, a NAS file URL, or
 * a `/_api/v3/board/assets/...` URL) onto the board as an `image` shape at the
 * current viewport centre. The URL is stored verbatim in the asset's `src`,
 * so it must be same-origin/relative to survive Yjs sharing.
 */
export const insertImageFromUrl = async (
  editor: Editor,
  url: string,
  name: string,
  mimeType = 'image/png',
): Promise<void> => {
  const { w, h } = await loadDimensions(url);
  const scale = Math.min(1, MAX_INITIAL / Math.max(w, h));
  const dw = Math.round(w * scale) || 320;
  const dh = Math.round(h * scale) || 240;

  const assetId = AssetRecordType.createId();
  editor.createAssets([
    {
      id: assetId,
      type: 'image',
      typeName: 'asset',
      props: {
        name,
        src: url,
        w,
        h,
        mimeType,
        isAnimated: mimeType === 'image/gif',
      },
      meta: {},
    },
  ]);

  const center = editor.getViewportPageBounds().center;
  editor.createShape({
    type: 'image',
    x: center.x - dw / 2,
    y: center.y - dh / 2,
    props: { assetId, w: dw, h: dh },
  });
};
