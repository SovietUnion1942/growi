import { type JSX, useEffect, useRef } from 'react';
import { baseKeymap } from 'prosemirror-commands';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

import type { WysiwygLabels } from './labels';
import { markdownToDoc } from './markdown/parser';
import { veSchema } from './markdown/schema';
import { docToMarkdown } from './markdown/serializer';
import { buildInputRules } from './prosemirror/inputRules';
import { buildKeymap } from './prosemirror/keymap';
import { applyNodeRangeDiff } from './prosemirror/nodeRangeDiff';
import { SourceBlockView } from './prosemirror/sourceBlockView';
import { buildToolbar } from './prosemirror/toolbar';

import styles from './WysiwygEditorMain.module.scss';

export type WysiwygHandle = {
  getMarkdown: () => string;
  /** CM 側の最新 markdown を WYSIWYG doc に寄せる(外部編集の取り込み) */
  applyExternalMarkdown: (markdown: string) => void;
  /** 未フラッシュのローカル編集を抱えているか */
  hasPendingLocalEdit: () => boolean;
};

type Props = {
  initialMarkdown: string;
  breaks: boolean;
  onChange: (markdown: string) => void;
  onSave?: () => void;
  onViewReady?: (handle: WysiwygHandle) => void;
  labels?: WysiwygLabels;
  autoFormatMarkdownTable?: boolean;
  debounceMs?: number;
};

/**
 * ProseMirror ベースの WYSIWYG エディタ本体。
 * マウント時に initialMarkdown のスナップショットからビューを構築し、
 * 編集は debounce して onChange(markdown) で親へ返す。
 * initialMarkdown / breaks / labels の変更では再構築しない(モード再入場で key を変えて再マウント)。
 * 定常状態の外部編集は onViewReady で渡す handle.applyExternalMarkdown() で取り込む。
 */
export const WysiwygEditorMain = (props: Props): JSX.Element => {
  const hostRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const host = hostRef.current;
    if (host == null) return;

    const { initialMarkdown, breaks, debounceMs = 400 } = propsRef.current;

    const toolbar = buildToolbar(veSchema, propsRef.current.labels?.toolbar);
    const editorHost = document.createElement('div');
    editorHost.className = 've-editor-host';
    host.replaceChildren(toolbar.dom, editorHost);

    const state = EditorState.create({
      doc: markdownToDoc(initialMarkdown, breaks),
      plugins: [
        buildInputRules(veSchema),
        keymap(buildKeymap(veSchema, () => propsRef.current.onSave?.())),
        keymap(baseKeymap),
        dropCursor(),
        gapCursor(),
        history(),
      ],
    });

    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      timer = undefined;
      propsRef.current.onChange(docToMarkdown(view.state.doc));
    };

    const reconcileToMarkdown = (markdown: string) => {
      if (markdown === docToMarkdown(view.state.doc)) return; // (A) ループ遮断
      const nextDoc = markdownToDoc(markdown, breaks);
      if (view.state.doc.eq(nextDoc)) return;
      applyNodeRangeDiff(view, nextDoc);
    };

    const applyExternalMarkdown = (markdown: string) => {
      if (timer != null) {
        // (B) ユーザー編集中: ローカルを先に CM へ出す。親が merge 後に再度呼ぶ。
        clearTimeout(timer);
        flush();
        return;
      }
      reconcileToMarkdown(markdown);
    };

    const view = new EditorView(editorHost, {
      state,
      nodeViews: {
        source_block: (node, v, getPos) =>
          new SourceBlockView(node, v, getPos, {
            labels: propsRef.current.labels?.sourceBlock,
            tableLabels: propsRef.current.labels?.tableGrid,
            autoFormatMarkdownTable: propsRef.current.autoFormatMarkdownTable,
          }),
      },
      dispatchTransaction(tr) {
        view.updateState(view.state.apply(tr));
        toolbar.update(view);
        if (tr.getMeta('ve-external') === true) return; // 反映のみ、flush しない
        if (tr.docChanged) {
          if (timer) clearTimeout(timer);
          timer = setTimeout(flush, debounceMs);
        }
      },
    });
    toolbar.update(view);
    view.focus();

    propsRef.current.onViewReady?.({
      getMarkdown: () => docToMarkdown(view.state.doc),
      applyExternalMarkdown,
      hasPendingLocalEdit: () => timer != null,
    });

    return () => {
      if (timer) clearTimeout(timer);
      view.destroy();
      host.replaceChildren();
    };
  }, []);

  return <div ref={hostRef} className={styles.root} />;
};
