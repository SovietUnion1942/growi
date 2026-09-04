import { Fragment, type Node as PmNode } from 'prosemirror-model';
import { Selection, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

export type NodeRange = { start: number; oldEnd: number; newEnd: number };

/**
 * 2 つの doc のトップレベル子ノードを先頭・末尾から `eq` で突き合わせ、
 * 一致しない中央の [start, oldEnd) / [start, newEnd) 範囲を返す。
 */
export function computeNodeRange(oldDoc: PmNode, newDoc: PmNode): NodeRange {
  const oldN = oldDoc.childCount;
  const newN = newDoc.childCount;

  let start = 0;
  while (
    start < oldN &&
    start < newN &&
    oldDoc.child(start).eq(newDoc.child(start))
  ) {
    start++;
  }

  let oldEnd = oldN;
  let newEnd = newN;
  while (
    oldEnd > start &&
    newEnd > start &&
    oldDoc.child(oldEnd - 1).eq(newDoc.child(newEnd - 1))
  ) {
    oldEnd--;
    newEnd--;
  }

  return { start, oldEnd, newEnd };
}

function offsetOfChild(doc: PmNode, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;
  return pos;
}

/**
 * WYSIWYG の doc を newDoc に最小の 1 レンジ置換で寄せる。
 * - 履歴には積まない / スクロール位置は据え置き / meta 've-external' を立てる
 * - 選択は「変更範囲より前=不変 / 後=マッピング / 内=範囲先頭にクランプ」
 */
export function applyNodeRangeDiff(view: EditorView, newDoc: PmNode): void {
  const oldDoc = view.state.doc;
  const { start, oldEnd, newEnd } = computeNodeRange(oldDoc, newDoc);
  if (start === oldEnd && start === newEnd) return;

  const from = offsetOfChild(oldDoc, start);
  const to = offsetOfChild(oldDoc, oldEnd);

  const replacement: PmNode[] = [];
  for (let i = start; i < newEnd; i++) replacement.push(newDoc.child(i));

  const anchorBefore = view.state.selection.anchor;
  const headBefore = view.state.selection.head;

  const tr = view.state.tr.replaceWith(
    from,
    to,
    Fragment.fromArray(replacement),
  );
  tr.setMeta('ve-external', true);
  tr.setMeta('addToHistory', false);

  try {
    const clamp = (p: number): number => {
      const mapped =
        p <= from ? p : p >= to ? tr.mapping.map(p) : Math.min(from, to);
      return Math.max(0, Math.min(mapped, tr.doc.content.size));
    };
    const a = clamp(anchorBefore);
    const h = clamp(headBefore);
    const $a = tr.doc.resolve(a);
    tr.setSelection(
      $a.parent.inlineContent
        ? TextSelection.between(tr.doc.resolve(a), tr.doc.resolve(h))
        : Selection.near($a),
    );
  } catch {
    /* PM の自動マッピングに任せる */
  }

  const host = view.dom.parentElement;
  const scrollTop = host?.scrollTop;
  view.dispatch(tr);
  if (host != null && scrollTop != null) host.scrollTop = scrollTop;
}
