import { setBlockType, toggleMark, wrapIn } from 'prosemirror-commands';
import type { MarkType, Schema } from 'prosemirror-model';
import { wrapInList } from 'prosemirror-schema-list';
import type { Command, EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

type Item = {
  label: string;
  title: string;
  cmd: Command;
  active?: (s: EditorState) => boolean;
};

function markActive(state: EditorState, type: MarkType): boolean {
  const { from, $from, to, empty } = state.selection;
  return empty
    ? type.isInSet(state.storedMarks || $from.marks()) != null
    : state.doc.rangeHasMark(from, to, type);
}

/** カーソル位置のリストアイテムの checked をトグル(null↔false↔true→null) */
function cycleTask(schema: Schema): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      if (node.type === schema.nodes.list_item) {
        if (dispatch) {
          const pos = $from.before(d);
          const cur = node.attrs.checked;
          const next = cur === null ? false : cur === false ? true : null;
          dispatch(
            state.tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              checked: next,
            }),
          );
        }
        return true;
      }
    }
    return false;
  };
}

export function buildToolbar(schema: Schema): {
  dom: HTMLElement;
  update: (v: EditorView) => void;
} {
  const items: Item[] = [
    {
      label: 'H1',
      title: '見出し1',
      cmd: setBlockType(schema.nodes.heading, { level: 1 }),
    },
    {
      label: 'H2',
      title: '見出し2',
      cmd: setBlockType(schema.nodes.heading, { level: 2 }),
    },
    {
      label: 'H3',
      title: '見出し3',
      cmd: setBlockType(schema.nodes.heading, { level: 3 }),
    },
    { label: 'P', title: '本文', cmd: setBlockType(schema.nodes.paragraph) },
    {
      label: 'B',
      title: '太字',
      cmd: toggleMark(schema.marks.strong),
      active: (s) => markActive(s, schema.marks.strong),
    },
    {
      label: 'I',
      title: '斜体',
      cmd: toggleMark(schema.marks.em),
      active: (s) => markActive(s, schema.marks.em),
    },
    {
      label: 'S',
      title: '打ち消し',
      cmd: toggleMark(schema.marks.s),
      active: (s) => markActive(s, schema.marks.s),
    },
    {
      label: '<>',
      title: 'インラインコード',
      cmd: toggleMark(schema.marks.code),
      active: (s) => markActive(s, schema.marks.code),
    },
    {
      label: '• 一覧',
      title: '箇条書き',
      cmd: wrapInList(schema.nodes.bullet_list),
    },
    {
      label: '1. 一覧',
      title: '番号リスト',
      cmd: wrapInList(schema.nodes.ordered_list),
    },
    { label: '☑', title: 'タスク化', cmd: cycleTask(schema) },
    { label: '❝', title: '引用', cmd: wrapIn(schema.nodes.blockquote) },
    {
      label: '❮❯',
      title: 'コードブロック',
      cmd: setBlockType(schema.nodes.code_block),
    },
    {
      label: '🔗',
      title: 'リンク',
      cmd: (state, dispatch, view) => {
        if (state.selection.empty) return false;
        if (dispatch && view) {
          // biome-ignore lint/suspicious/noAlert: MVP link dialog; replace with a custom UI later
          const href = window.prompt('リンク先 URL');
          if (href) {
            toggleMark(schema.marks.link, { href })(state, dispatch, view);
          }
        }
        return true;
      },
    },
  ];

  const dom = document.createElement('div');
  dom.className = 've-toolbar';
  const buttons = items.map((it) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = it.label;
    b.title = it.title;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    dom.appendChild(b);
    return { it, b };
  });

  let currentView: EditorView | null = null;
  for (const { it, b } of buttons) {
    b.addEventListener('click', () => {
      const v = currentView;
      if (!v) return;
      it.cmd(v.state, (tr) => v.dispatch(tr), v);
      v.focus();
    });
  }

  const update = (v: EditorView) => {
    currentView = v;
    for (const { it, b } of buttons) {
      const enabled = it.cmd(v.state, undefined, v);
      b.disabled = !enabled;
      b.classList.toggle('is-active', it.active?.(v.state) ?? false);
    }
  };

  return { dom, update };
}
