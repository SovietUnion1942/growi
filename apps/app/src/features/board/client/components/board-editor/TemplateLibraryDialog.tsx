import type { JSX } from 'react';
import { useState } from 'react';
import {
  type TLContent,
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

import {
  deleteBoardTemplate,
  fetchBoardTemplate,
  useSWRxBoardTemplates,
} from '../../stores/board-templates';

/**
 * The shared template library: pick one to drop its content onto the current
 * board (`editor.putContentOntoCurrentPage`), or delete your own.
 */
export const TemplateLibraryDialog = ({
  onClose,
}: TLUiDialogProps): JSX.Element => {
  const editor = useEditor();
  const { addToast } = useToasts();
  const { data: templates, isLoading } = useSWRxBoardTemplates();
  const [busyId, setBusyId] = useState<string | null>(null);

  const insert = async (id: string, name: string) => {
    setBusyId(id);
    try {
      const tpl = await fetchBoardTemplate(id);
      const center = editor.getViewportPageBounds().center;
      editor.putContentOntoCurrentPage(tpl.content as TLContent, {
        point: center,
        select: true,
      });
      addToast({ title: `「${name}」を挿入しました`, severity: 'success' });
      onClose();
    } catch {
      addToast({
        title: 'テンプレートの挿入に失敗しました',
        severity: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    // biome-ignore lint/suspicious/noAlert: confirm a destructive delete
    if (!window.confirm('このテンプレートを削除しますか？')) return;
    setBusyId(id);
    try {
      await deleteBoardTemplate(id);
    } catch {
      addToast({ title: '削除に失敗しました', severity: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <TldrawUiDialogHeader>
        <TldrawUiDialogTitle>テンプレートライブラリ</TldrawUiDialogTitle>
        <TldrawUiDialogCloseButton />
      </TldrawUiDialogHeader>
      <TldrawUiDialogBody
        style={{ width: 460, maxHeight: 460, overflowY: 'auto' }}
      >
        {isLoading && <p>読み込み中…</p>}
        {!isLoading && (templates?.length ?? 0) === 0 && (
          <p style={{ opacity: 0.7 }}>
            まだテンプレートがありません。ボードで要素を選んでメニューの「テンプレートとして保存」から追加できます。
          </p>
        )}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 10,
          }}
        >
          {(templates ?? []).map((t) => (
            <div
              key={t._id}
              style={{
                border: '1px solid var(--color-divider)',
                borderRadius: 8,
                padding: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <button
                type="button"
                disabled={busyId != null}
                onClick={() => insert(t._id, t.name)}
                style={{
                  border: 0,
                  background: 'var(--color-muted-2)',
                  borderRadius: 6,
                  aspectRatio: '4 / 3',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  padding: 0,
                }}
              >
                {t.thumbnail ? (
                  // biome-ignore lint/performance/noImgElement: data URI thumbnail
                  <img
                    src={t.thumbnail}
                    alt={t.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                    }}
                  />
                ) : (
                  <span style={{ fontSize: 11, opacity: 0.6 }}>
                    プレビューなし
                  </span>
                )}
              </button>
              <strong style={{ fontSize: 13 }}>{t.name}</strong>
              {t.description && (
                <span style={{ fontSize: 11, opacity: 0.75 }}>
                  {t.description}
                </span>
              )}
              <span style={{ fontSize: 10, opacity: 0.5 }}>
                {t.createdByName ?? '不明'}
              </span>
              {t.isOwn && (
                <button
                  type="button"
                  disabled={busyId != null}
                  onClick={() => remove(t._id)}
                  style={{
                    border: 0,
                    background: 'transparent',
                    color: 'var(--color-warn)',
                    fontSize: 11,
                    cursor: 'pointer',
                    alignSelf: 'flex-start',
                    padding: 0,
                  }}
                >
                  削除
                </button>
              )}
            </div>
          ))}
        </div>
      </TldrawUiDialogBody>
      <div
        className="tlui-dialog__footer tlui-dialog__footer__actions"
        style={{ display: 'flex', justifyContent: 'flex-end', padding: 8 }}
      >
        <TldrawUiButton type="normal" onClick={onClose}>
          <TldrawUiButtonLabel>閉じる</TldrawUiButtonLabel>
        </TldrawUiButton>
      </div>
    </>
  );
};
