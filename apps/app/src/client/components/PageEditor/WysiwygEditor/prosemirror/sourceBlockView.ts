import type { Node as PmNode } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';

import {
  createTableGrid,
  type TableGridHandle,
  type TableGridLabels,
} from './tableGrid';

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

const DEFAULT_TABLE_LABELS: TableGridLabels = {
  addRow: '行',
  addCol: '列',
  delRow: '行を削除',
  delCol: '列を削除',
  alignLeft: '左揃え',
  alignCenter: '中央揃え',
  alignRight: '右揃え',
  alignNone: '揃えなし',
  editAsText: 'テキストで編集',
};

export type SourceBlockViewOptions = {
  labels?: Partial<SourceBlockLabels>;
  tableLabels?: Partial<TableGridLabels>;
  autoFormatMarkdownTable?: boolean;
};

/**
 * GROWI 独自記法 / 生 HTML / テーブル / frontmatter を表示する不透明ノード。
 * WYSIWYG ではリッチ編集せず「ソースをそのまま編集」できるカードにする。
 * kind==='table' はカード内に表グリッドエディタを出す(解析不能なら textarea)。
 */
export class SourceBlockView implements NodeView {
  dom: HTMLElement;

  private node: PmNode;

  private view: EditorView;

  private getPos: () => number | undefined;

  private labels: SourceBlockLabels;

  private tableLabels: TableGridLabels;

  private autoFormatMarkdownTable: boolean;

  private body: HTMLElement;

  private editing = false;

  private grid: TableGridHandle | null = null;

  constructor(
    node: PmNode,
    view: EditorView,
    getPos: () => number | undefined,
    opts?: SourceBlockViewOptions,
  ) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.labels = { ...DEFAULT_LABELS, ...opts?.labels };
    this.tableLabels = { ...DEFAULT_TABLE_LABELS, ...opts?.tableLabels };
    this.autoFormatMarkdownTable = opts?.autoFormatMarkdownTable ?? true;

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

    this.body = this.buildBody();
    this.dom.append(bar, this.body);
  }

  /** kind に応じてグリッド or pre を返す。グリッド化に失敗したら pre。 */
  private buildBody(): HTMLElement {
    if (this.node.attrs.kind === 'table') {
      try {
        this.grid = createTableGrid({
          source: this.node.attrs.source,
          autoFormatMarkdownTable: this.autoFormatMarkdownTable,
          labels: this.tableLabels,
          onCommit: (src) => this.commitSource(src),
        });
        return this.grid.dom;
      } catch {
        this.grid = null;
      }
    }
    const pre = document.createElement('pre');
    pre.className = 've-source-pre';
    pre.textContent = this.node.attrs.source;
    return pre;
  }

  /** ノードの source 属性を更新(未変更なら何もしない) */
  private commitSource(value: string): void {
    const pos = this.getPos();
    if (pos == null) return;
    if (value === this.node.attrs.source) return;
    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(pos, undefined, {
        ...this.node.attrs,
        source: value,
      }),
    );
  }

  private toggleEdit(): void {
    if (this.editing) return;
    this.editing = true;
    this.grid?.destroy();
    this.grid = null;

    const ta = document.createElement('textarea');
    ta.className = 've-source-ta';
    ta.value = this.node.attrs.source;
    ta.rows = Math.min(
      20,
      Math.max(3, this.node.attrs.source.split('\n').length + 1),
    );
    this.body.replaceWith(ta);
    this.body = ta;
    ta.focus();

    const commit = () => {
      this.editing = false;
      const value = ta.value;
      this.body = this.buildBody();
      ta.replaceWith(this.body);
      this.commitSource(value);
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
    if (node.attrs.kind !== this.node.attrs.kind) return false;
    this.node = node;
    this.dom.setAttribute('data-kind', node.attrs.kind);
    if (this.editing) return true;
    if (this.grid != null) {
      this.grid.setSource(node.attrs.source);
    } else if (this.body instanceof HTMLPreElement) {
      this.body.textContent = node.attrs.source;
    }
    return true;
  }

  stopEvent(event: Event): boolean {
    if (!(event.target instanceof globalThis.Node)) return false;
    if (this.editing) return this.dom.contains(event.target);
    if (this.grid != null) return this.grid.dom.contains(event.target);
    return false;
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    this.grid?.destroy();
    this.grid = null;
  }
}
