import type { CSSProperties, JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type TLUiDialogProps,
  TldrawUiButton,
  TldrawUiButtonLabel,
  TldrawUiDialogBody,
  TldrawUiDialogCloseButton,
  TldrawUiDialogHeader,
  TldrawUiDialogTitle,
  useEditor,
  useToasts,
} from 'tldraw';

import { apiv3Get } from '~/client/util/apiv3-client';

import { boardAssetStore } from './board-asset-store';
import { insertImageFromUrl } from './insert-image';

type Tab = 'wiki' | 'nas' | 'upload';
type Pickable = { url: string; name: string; mimeType?: string };

const isImageName = (name: string): boolean =>
  /\.(png|jpe?g|gif|webp|svg)$/i.test(name);

const Grid = ({
  items,
  onPick,
}: {
  items: Pickable[];
  onPick: (p: Pickable) => void;
}): JSX.Element => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 8,
      marginTop: 8,
    }}
  >
    {items.map((it) => (
      <button
        key={it.url}
        type="button"
        onClick={() => onPick(it)}
        title={it.name}
        style={{
          border: '1px solid var(--color-divider)',
          borderRadius: 6,
          padding: 0,
          aspectRatio: '1',
          cursor: 'pointer',
          overflow: 'hidden',
          background: 'var(--color-muted-2)',
        }}
      >
        {/* biome-ignore lint/performance/noImgElement: thumbnail of a same-origin asset */}
        <img
          src={it.url}
          alt={it.name}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </button>
    ))}
  </div>
);

/**
 * Insert an image onto the board from three sources: attachments of a wiki
 * page (defaults to the page the board is embedded in), the NAS storage
 * browser, or a fresh upload. All three resolve to a same-origin URL that is
 * stored on the tldraw asset and shared through Yjs.
 */
export const ImagePickerDialog = ({
  onClose,
}: TLUiDialogProps & { fromPageId?: string }): JSX.Element => {
  const editor = useEditor();
  const { addToast } = useToasts();
  const params =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  const initialPageId = params.get('fromPageId') ?? '';

  const [tab, setTab] = useState<Tab>(initialPageId ? 'wiki' : 'upload');
  const [busy, setBusy] = useState(false);

  const pick = useCallback(
    async (p: Pickable) => {
      setBusy(true);
      try {
        await insertImageFromUrl(editor, p.url, p.name, p.mimeType);
        onClose();
      } catch {
        addToast({ title: '画像の挿入に失敗しました', severity: 'error' });
      } finally {
        setBusy(false);
      }
    },
    [editor, addToast, onClose],
  );

  return (
    <>
      <TldrawUiDialogHeader>
        <TldrawUiDialogTitle>画像を挿入</TldrawUiDialogTitle>
        <TldrawUiDialogCloseButton />
      </TldrawUiDialogHeader>
      <TldrawUiDialogBody style={{ width: 460, minHeight: 260 }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {(
            [
              ['wiki', 'Wikiページの添付'],
              ['nas', 'NASもどき'],
              ['upload', 'アップロード'],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              style={{
                border: 0,
                borderBottom:
                  tab === k
                    ? '2px solid var(--color-selected)'
                    : '2px solid transparent',
                background: 'transparent',
                padding: '4px 8px',
                cursor: 'pointer',
                fontWeight: tab === k ? 600 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'wiki' && (
          <WikiTab initialPageId={initialPageId} onPick={pick} busy={busy} />
        )}
        {tab === 'nas' && <NasTab onPick={pick} busy={busy} />}
        {tab === 'upload' && (
          <UploadTab
            busy={busy}
            onUploaded={(url, name, mime) =>
              pick({ url, name, mimeType: mime })
            }
          />
        )}
      </TldrawUiDialogBody>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 8 }}>
        <TldrawUiButton type="normal" onClick={onClose}>
          <TldrawUiButtonLabel>閉じる</TldrawUiButtonLabel>
        </TldrawUiButton>
      </div>
    </>
  );
};

const WikiTab = ({
  initialPageId,
  onPick,
  busy,
}: {
  initialPageId: string;
  onPick: (p: Pickable) => void;
  busy: boolean;
}): JSX.Element => {
  const [pagePath, setPagePath] = useState('');
  const [pageId, setPageId] = useState(initialPageId);
  const [items, setItems] = useState<Pickable[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pageId === '') return;
    let live = true;
    setError(null);
    apiv3Get('/attachment/list', { pageId, pageNumber: 1, limit: 60 })
      .then((res) => {
        if (!live) return;
        // biome-ignore lint/suspicious/noExplicitAny: attachment doc
        const docs: any[] = res.data.paginateResult?.docs ?? [];
        setItems(
          docs
            .filter((d) => String(d.fileFormat ?? '').startsWith('image/'))
            .map((d) => ({
              url: d.filePathProxied ?? `/attachment/${d._id}`,
              name: d.originalName ?? d.fileName ?? 'image',
              mimeType: d.fileFormat,
            })),
        );
      })
      .catch(() => live && setError('このページの添付を取得できませんでした'));
    return () => {
      live = false;
    };
  }, [pageId]);

  const resolvePath = async () => {
    const p = pagePath.trim();
    if (p === '') return;
    try {
      const res = await apiv3Get('/page', {
        path: p.startsWith('/') ? p : `/${p}`,
      });
      const id = res.data.page?._id;
      if (id) setPageId(id);
      else setError('ページが見つかりません');
    } catch {
      setError('ページが見つかりません');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={pagePath}
          placeholder="/ページのパス で他ページの添付を見る"
          onChange={(e) => setPagePath(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && resolvePath()}
          style={{ flex: 1, padding: 6 }}
        />
        <TldrawUiButton type="normal" onClick={resolvePath}>
          <TldrawUiButtonLabel>表示</TldrawUiButtonLabel>
        </TldrawUiButton>
      </div>
      {pageId === '' && (
        <p style={{ opacity: 0.7, fontSize: 12 }}>
          ボードが埋め込まれたページのパスを入力してください。
        </p>
      )}
      {error && (
        <p style={{ color: 'var(--color-warn)', fontSize: 12 }}>{error}</p>
      )}
      {items.length === 0 && pageId !== '' && !error && (
        <p style={{ opacity: 0.7, fontSize: 12 }}>画像の添付がありません。</p>
      )}
      <div style={{ pointerEvents: busy ? 'none' : 'auto' }}>
        <Grid items={items} onPick={onPick} />
      </div>
    </div>
  );
};

const NasTab = ({
  onPick,
  busy,
}: {
  onPick: (p: Pickable) => void;
  busy: boolean;
}): JSX.Element => {
  const [path, setPath] = useState('/');
  const [dirs, setDirs] = useState<string[]>([]);
  const [images, setImages] = useState<Pickable[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    apiv3Get('/nas-storage/entries', { path, limit: 200 })
      .then((res) => {
        if (!live) return;
        // biome-ignore lint/suspicious/noExplicitAny: nas entry
        const entries: any[] = res.data.entries ?? [];
        setDirs(
          entries.filter((e) => e.type === 'directory').map((e) => e.name),
        );
        setImages(
          entries
            .filter((e) => e.type === 'file' && isImageName(e.name))
            .map((e) => {
              const p = `${path.replace(/\/$/, '')}/${e.name}`;
              return {
                url: `/_api/v3/nas-storage/file?path=${encodeURIComponent(p)}&inline=1`,
                name: e.name,
              };
            }),
        );
      })
      .catch(() => live && setError('NASを閲覧できませんでした'));
    return () => {
      live = false;
    };
  }, [path]);

  const go = (name: string) =>
    setPath(
      name === '..'
        ? path.replace(/\/[^/]+\/?$/, '') || '/'
        : `${path.replace(/\/$/, '')}/${name}`,
    );

  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{path}</div>
      {error && (
        <p style={{ color: 'var(--color-warn)', fontSize: 12 }}>{error}</p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {path !== '/' && (
          <button type="button" onClick={() => go('..')} style={folderBtn}>
            ⬆ 上へ
          </button>
        )}
        {dirs.map((d) => (
          <button key={d} type="button" onClick={() => go(d)} style={folderBtn}>
            📁 {d}
          </button>
        ))}
      </div>
      <div style={{ pointerEvents: busy ? 'none' : 'auto' }}>
        <Grid items={images} onPick={onPick} />
      </div>
    </div>
  );
};

const folderBtn: React.CSSProperties = {
  border: '1px solid var(--color-divider)',
  borderRadius: 6,
  background: 'transparent',
  padding: '4px 8px',
  cursor: 'pointer',
  fontSize: 12,
};

const UploadTab = ({
  busy,
  onUploaded,
}: {
  busy: boolean;
  onUploaded: (url: string, name: string, mime: string) => void;
}): JSX.Element => {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const { src } = await boardAssetStore.upload(
        { props: {} } as never,
        file,
      );
      onUploaded(src, file.name, file.type);
    } catch {
      setError('アップロードに失敗しました');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ textAlign: 'center', padding: 24 }}>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />
      <TldrawUiButton
        type="primary"
        disabled={busy || uploading}
        onClick={() => ref.current?.click()}
      >
        <TldrawUiButtonLabel>
          {uploading ? 'アップロード中…' : '画像ファイルを選ぶ'}
        </TldrawUiButtonLabel>
      </TldrawUiButton>
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 8 }}>
        ボードに直接ドラッグ＆ドロップ／貼り付けでも追加できます。
      </p>
      {error && (
        <p style={{ color: 'var(--color-warn)', fontSize: 12 }}>{error}</p>
      )}
    </div>
  );
};
