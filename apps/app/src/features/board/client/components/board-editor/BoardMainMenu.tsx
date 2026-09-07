import type { JSX } from 'react';
import {
  DefaultMainMenu,
  DefaultMainMenuContent,
  TldrawUiMenuItem,
  useDialogs,
} from 'tldraw';

import { ImagePickerDialog } from './ImagePickerDialog';
import { SaveTemplateDialog } from './SaveTemplateDialog';
import { TemplateLibraryDialog } from './TemplateLibraryDialog';

/**
 * The board's hamburger menu = tldraw's default menu plus board-content
 * actions: save the current selection as a shared template, open the
 * template library, or insert an image from a wiki page / NAS / upload.
 */
export const BoardMainMenu = (): JSX.Element => {
  const { addDialog } = useDialogs();

  return (
    <DefaultMainMenu>
      {/* biome-ignore lint/correctness/useUniqueElementIds: tldraw menu-item id, not a DOM id */}
      <TldrawUiMenuItem
        id="board-save-template"
        label="テンプレートとして保存"
        readonlyOk={false}
        onSelect={() => {
          addDialog({ component: (p) => <SaveTemplateDialog {...p} /> });
        }}
      />
      {/* biome-ignore lint/correctness/useUniqueElementIds: tldraw menu-item id, not a DOM id */}
      <TldrawUiMenuItem
        id="board-template-library"
        label="テンプレートライブラリ"
        readonlyOk
        onSelect={() => {
          addDialog({ component: (p) => <TemplateLibraryDialog {...p} /> });
        }}
      />
      {/* biome-ignore lint/correctness/useUniqueElementIds: tldraw menu-item id, not a DOM id */}
      <TldrawUiMenuItem
        id="board-insert-image"
        label="画像を挿入"
        readonlyOk={false}
        onSelect={() => {
          addDialog({ component: (p) => <ImagePickerDialog {...p} /> });
        }}
      />
      <DefaultMainMenuContent />
    </DefaultMainMenu>
  );
};
