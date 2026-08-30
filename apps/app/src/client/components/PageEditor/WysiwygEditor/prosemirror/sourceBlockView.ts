import type { Node as PmNode } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';

export type SourceBlockLabels = {
  container: string;
  directive: string;
  table: string;
  html: string;
  frontmatter: string;
  raw: string;
  editButton: string;
};

const DEFAULT_LABELS: SourceBlockLabels = {
  container: ':::  ブロック',
  directive: 'ディレクティブ',
  table: 'テーブル',
  html: 'HTML',
  frontmatter: 'frontmatter',
  raw: 'ソース',
  editButton: 'ソース編集',
};

/**
 * GROWI 独自記法 / 生 HTML / テーブル / frontmatter を表示する不透明ノード。
 * WYSIWYG ではリッチ編集せず「ソースをそのまま編集」できるカードにする。
 */
export class SourceBlockView implements NodeView {
  dom: HTMLElement;

  private node: PmNode;

  private view: EditorView;

  private getPos: () => number | undefined;

  private pre: HTMLElement;

  private editing = false;

  private labels: SourceBlockLabels;

  constructor(
    node: PmNode,
    view: EditorView,
    getPos: () => number | undefined,
    labels?: Partial<SourceBlockLabels>,
  ) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.labels = { ...DEFAULT_LABELS, ...labels };

    this.dom = document.createElement('div');
    this.dom.className = 've-source-block';
    this.dom.setAttribute('data-kind', node.attrs.kind);

    const bar = document.createElement('div');
    bar.className = 've-source-bar';
    const label = document.createElement('span');
    label.textContent =
      this.labels[node.attrs.kind as keyof SourceBlockLabels] ??
      this.labels.raw;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 've-source-edit';
    btn.textContent = this.labels.editButton;
    btn.addEventListener('click', () => this.toggleEdit());
    bar.append(label, btn);

    this.pre = document.createElement('pre');
    this.pre.className = 've-source-pre';
    this.pre.textContent = node.attrs.source;

    this.dom.append(bar, this.pre);
  }

  private toggleEdit(): void {
    if (this.editing) return;
    this.editing = true;
    const ta = document.createElement('textarea');
    ta.className = 've-source-ta';
    ta.value = this.node.attrs.source;
    ta.rows = Math.min(
      20,
      Math.max(3, this.node.attrs.source.split('\n').length + 1),
    );
    this.pre.replaceWith(ta);
    ta.focus();

    const commit = () => {
      const pos = this.getPos();
      this.editing = false;
      if (pos == null) return;
      const value = ta.value;
      this.pre = document.createElement('pre');
      this.pre.className = 've-source-pre';
      this.pre.textContent = value;
      ta.replaceWith(this.pre);
      if (value !== this.node.attrs.source) {
        this.view.dispatch(
          this.view.state.tr.setNodeMarkup(pos, undefined, {
            ...this.node.attrs,
            source: value,
          }),
        );
      }
      this.view.focus();
    };

    ta.addEventListener('blur', commit);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        ta.blur();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        ta.value = this.node.attrs.source;
        ta.blur();
      }
    });
  }

  update(node: PmNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    if (!this.editing) this.pre.textContent = node.attrs.source;
    this.dom.setAttribute('data-kind', node.attrs.kind);
    return true;
  }

  stopEvent(event: Event): boolean {
    return this.editing && event.target instanceof globalThis.Node
      ? this.dom.contains(event.target as globalThis.Node)
      : false;
  }

  ignoreMutation(): boolean {
    return true;
  }
}
