import { type JSX, useEffect, useRef } from 'react';
import { baseKeymap } from 'prosemirror-commands';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

import { markdownToDoc } from './markdown/parser';
import { veSchema } from './markdown/schema';
import { docToMarkdown } from './markdown/serializer';
import { buildInputRules } from './prosemirror/inputRules';
import { buildKeymap } from './prosemirror/keymap';
import { SourceBlockView } from './prosemirror/sourceBlockView';
import { buildToolbar } from './prosemirror/toolbar';

import styles from './WysiwygEditorMain.module.scss';

type Props = {
  initialMarkdown: string;
  breaks: boolean;
  onChange: (markdown: string) => void;
  onSave?: () => void;
  onViewReady?: (getMarkdown: () => string) => void;
  debounceMs?: number;
};

/**
 * ProseMirror ベースの WYSIWYG エディタ本体。
 * マウント時に initialMarkdown のスナップショットからビューを構築し、
 * 編集は debounce して onChange(markdown) で親へ返す。
 * initialMarkdown / breaks の変更では再構築しない(モード再入場で key を変えて再マウント)。
 */
export const WysiwygEditorMain = (props: Props): JSX.Element => {
  const hostRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const host = hostRef.current;
    if (host == null) return;

    const { initialMarkdown, breaks, debounceMs = 400 } = propsRef.current;

    const toolbar = buildToolbar(veSchema);
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

    const view = new EditorView(editorHost, {
      state,
      nodeViews: {
        source_block: (node, v, getPos) => new SourceBlockView(node, v, getPos),
      },
      dispatchTransaction(tr) {
        view.updateState(view.state.apply(tr));
        toolbar.update(view);
        if (tr.docChanged) {
          if (timer) clearTimeout(timer);
          timer = setTimeout(flush, debounceMs);
        }
      },
    });
    toolbar.update(view);
    view.focus();

    propsRef.current.onViewReady?.(() => docToMarkdown(view.state.doc));

    return () => {
      if (timer) clearTimeout(timer);
      view.destroy();
      host.replaceChildren();
    };
  }, []);

  return <div ref={hostRef} className={styles.root} />;
};
