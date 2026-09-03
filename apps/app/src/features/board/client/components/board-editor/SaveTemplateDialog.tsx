import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import {
  type TLUiDialogProps,
  TldrawUiButton,
  TldrawUiButtonLabel,
  TldrawUiDialogBody,
  TldrawUiDialogCloseButton,
  TldrawUiDialogFooter,
  TldrawUiDialogHeader,
  TldrawUiDialogTitle,
  useEditor,
  useToasts,
} from 'tldraw';

import {
  BOARD_TEMPLATE_DESCRIPTION_MAX,
  BOARD_TEMPLATE_NAME_MAX,
} from '../../../interfaces/board-template';
import { createBoardTemplate } from '../../stores/board-templates';

/**
 * "Save as template": takes the current selection (or the whole page when
 * nothing is selected), a name and a description, generates a PNG thumbnail
 * and POSTs it to the shared template library.
 */
export const SaveTemplateDialog = ({
  onClose,
}: TLUiDialogProps): JSX.Element => {
  const editor = useEditor();
  const { addToast } = useToasts();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedIds = editor.getSelectedShapeIds();
  const targetIds =
    selectedIds.length > 0 ? selectedIds : [...editor.getCurrentPageShapeIds()];

  const save = useCallback(async () => {
    if (name.trim().length === 0 || targetIds.length === 0) return;
    setSaving(true);
    try {
      const content = editor.getContentFromCurrentPage(targetIds);
      if (content == null) {
        addToast({ title: '保存する内容がありません', severity: 'warning' });
        return;
      }
      let thumbnail: string | null = null;
      try {
        const { blob } = await editor.toImage(targetIds, {
          format: 'png',
          background: true,
          padding: 16,
          scale: 0.5,
        });
        if (blob.size < 256 * 1024) {
          thumbnail = await new Promise<string>((resolve) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.readAsDataURL(blob);
          });
        }
      } catch {
        // thumbnail is best-effort
      }
      await createBoardTemplate({
        name: name.trim(),
        description: description.trim(),
        content,
        thumbnail,
      });
      addToast({
        title: `テンプレート「${name.trim()}」を保存しました`,
        severity: 'success',
      });
      onClose();
    } catch {
      addToast({
        title: 'テンプレートの保存に失敗しました',
        severity: 'error',
      });
    } finally {
      setSaving(false);
    }
  }, [editor, name, description, targetIds, addToast, onClose]);

  return (
    <>
      <TldrawUiDialogHeader>
        <TldrawUiDialogTitle>テンプレートとして保存</TldrawUiDialogTitle>
        <TldrawUiDialogCloseButton />
      </TldrawUiDialogHeader>
      <TldrawUiDialogBody style={{ maxWidth: 380 }}>
        <p style={{ marginTop: 0, fontSize: 12, opacity: 0.7 }}>
          {selectedIds.length > 0
            ? `選択中の ${selectedIds.length} 個の要素を保存します`
            : 'このページ全体を保存します'}
        </p>
        <div style={{ fontSize: 12, marginBottom: 4 }}>名前</div>
        <input
          value={name}
          maxLength={BOARD_TEMPLATE_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          style={{ width: '100%', marginBottom: 12, padding: 6 }}
        />
        <div style={{ fontSize: 12, marginBottom: 4 }}>説明（任意）</div>
        <textarea
          value={description}
          maxLength={BOARD_TEMPLATE_DESCRIPTION_MAX}
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
          style={{ width: '100%', padding: 6, resize: 'vertical' }}
        />
      </TldrawUiDialogBody>
      <TldrawUiDialogFooter className="tlui-dialog__footer__actions">
        <TldrawUiButton type="normal" onClick={onClose}>
          <TldrawUiButtonLabel>キャンセル</TldrawUiButtonLabel>
        </TldrawUiButton>
        <TldrawUiButton
          type="primary"
          disabled={
            saving || name.trim().length === 0 || targetIds.length === 0
          }
          onClick={save}
        >
          <TldrawUiButtonLabel>
            {saving ? '保存中…' : '保存'}
          </TldrawUiButtonLabel>
        </TldrawUiButton>
      </TldrawUiDialogFooter>
    </>
  );
};
