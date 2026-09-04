import { useMemo } from 'react';
import { useTranslation } from 'next-i18next';

import type { SourceBlockLabels } from './prosemirror/sourceBlockView';
import type { TableGridLabels } from './prosemirror/tableGrid';
import type { ToolbarLabels } from './prosemirror/toolbar';

export type WysiwygLabels = {
  enter: string;
  exit: string;
  toolbar: ToolbarLabels;
  sourceBlock: SourceBlockLabels;
  tableGrid: TableGridLabels;
};

/**
 * 翻訳キー `page_edit.wysiwyg.*` から WYSIWYG 全体のラベルを組む。
 * EditorView 内のプレーン DOM 部品(toolbar / NodeView / grid)は React の外なので、
 * ここで文字列に解決して props で流し込む。
 */
export const useWysiwygLabels = (): WysiwygLabels => {
  const { t } = useTranslation();

  return useMemo<WysiwygLabels>(() => {
    const w = (key: string) => t(`page_edit.wysiwyg.${key}`);
    return {
      enter: w('enter'),
      exit: w('exit'),
      toolbar: {
        h1: w('toolbar.h1'),
        h2: w('toolbar.h2'),
        h3: w('toolbar.h3'),
        paragraph: w('toolbar.paragraph'),
        bold: w('toolbar.bold'),
        italic: w('toolbar.italic'),
        strike: w('toolbar.strike'),
        code: w('toolbar.code'),
        bulletList: w('toolbar.bullet_list'),
        orderedList: w('toolbar.ordered_list'),
        task: w('toolbar.task'),
        blockquote: w('toolbar.blockquote'),
        codeBlock: w('toolbar.code_block'),
        link: w('toolbar.link'),
        linkPrompt: w('toolbar.link_prompt'),
      },
      sourceBlock: {
        container: w('block.container'),
        directive: w('block.directive'),
        table: w('block.table'),
        html: w('block.html'),
        frontmatter: w('block.frontmatter'),
        raw: w('block.raw'),
        editButton: w('source_edit'),
      },
      tableGrid: {
        addRow: w('table.add_row'),
        addCol: w('table.add_col'),
        delRow: w('table.del_row'),
        delCol: w('table.del_col'),
        alignLeft: w('table.align_left'),
        alignCenter: w('table.align_center'),
        alignRight: w('table.align_right'),
        alignNone: w('table.align_none'),
        editAsText: w('table.edit_as_text'),
      },
    };
  }, [t]);
};
