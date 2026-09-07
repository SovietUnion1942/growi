import { MarkdownTable } from '@growi/editor';

export type TableGridLabels = {
  addRow: string;
  addCol: string;
  delRow: string;
  delCol: string;
  alignLeft: string;
  alignCenter: string;
  alignRight: string;
  alignNone: string;
  editAsText: string;
};

export type TableGridHandle = {
  dom: HTMLElement;
  /** グリッド未フォーカス時のみ外部変更を反映する */
  setSource: (source: string) => void;
  hasFocus: () => boolean;
  destroy: () => void;
};

type Align = '' | 'l' | 'c' | 'r';

const ALIGN_ORDER: Align[] = ['', 'l', 'c', 'r'];

function parse(source: string): { cells: string[][]; align: Align[] } {
  const mt = MarkdownTable.fromMarkdownString(source);
  const cells: string[][] = (mt.table ?? []).map((row: unknown[]) =>
    row.map((c) => (c == null ? '' : String(c))),
  );
  if (cells.length === 0 || cells[0].length === 0) {
    throw new Error('empty table');
  }
  const cols = cells[0].length;
  // 列数を揃える(欠けは '' 埋め、余りは切り捨て)
  const norm = cells.map((row) => {
    const r = row.slice(0, cols);
    while (r.length < cols) r.push('');
    return r;
  });
  const rawAlign: unknown[] = (mt.options?.align as unknown[]) ?? [];
  const align: Align[] = Array.from({ length: cols }, (_, i) => {
    const a = rawAlign[i];
    return a === 'l' || a === 'c' || a === 'r' ? a : '';
  });
  return { cells: norm, align };
}

/**
 * 不透明ブロック(kind==='table')のカード内に出す表グリッドエディタ。
 * MarkdownTable でパース/整形し、変更のたび markdown 文字列を onCommit で返す。
 * 解析できない表(エスケープされた `|` など)はコンストラクタが throw し、
 * 呼び出し側は textarea にフォールバックする。
 */
export function createTableGrid(opts: {
  source: string;
  autoFormatMarkdownTable: boolean;
  labels: TableGridLabels;
  onCommit: (source: string) => void;
}): TableGridHandle {
  const { labels, autoFormatMarkdownTable, onCommit } = opts;

  let model = parse(opts.source);

  const dom = document.createElement('div');
  dom.className = 've-table-grid';

  const serialize = (): string => {
    const pad = autoFormatMarkdownTable !== false;
    return new MarkdownTable(
      model.cells.map((row) => row.slice()),
      { align: model.align.slice(), pad },
    )
      .normalizeCells()
      .toString();
  };

  const commit = () => {
    onCommit(serialize());
  };

  const readInputs = () => {
    const inputs = dom.querySelectorAll<HTMLInputElement>('input[data-cell]');
    inputs.forEach((input) => {
      const r = Number(input.dataset.row);
      const c = Number(input.dataset.col);
      if (model.cells[r] != null && c < model.cells[r].length) {
        model.cells[r][c] = input.value;
      }
    });
  };

  const cycleAlign = (col: number) => {
    const cur = model.align[col];
    const idx = ALIGN_ORDER.indexOf(cur);
    model.align[col] = ALIGN_ORDER[(idx + 1) % ALIGN_ORDER.length];
  };

  const alignTitle = (a: Align): string =>
    a === 'l'
      ? labels.alignLeft
      : a === 'c'
        ? labels.alignCenter
        : a === 'r'
          ? labels.alignRight
          : labels.alignNone;

  const alignGlyph = (a: Align): string =>
    a === 'l' ? '⇤' : a === 'c' ? '↔' : a === 'r' ? '⇥' : '·';

  function render() {
    const cols = model.cells[0].length;
    const rows = model.cells.length;

    const table = document.createElement('table');

    // --- 揃えコントロール行 ---
    const alignRow = document.createElement('tr');
    alignRow.className = 've-table-grid-align';
    for (let c = 0; c < cols; c++) {
      const th = document.createElement('th');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 've-table-grid-alignbtn';
      btn.textContent = alignGlyph(model.align[c]);
      btn.title = alignTitle(model.align[c]);
      btn.addEventListener('click', () => {
        readInputs();
        cycleAlign(c);
        render();
        commit();
      });
      th.appendChild(btn);
      if (cols > 1) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 've-table-grid-del';
        del.textContent = '−';
        del.title = labels.delCol;
        del.addEventListener('click', () => {
          readInputs();
          model.cells = model.cells.map((row) => row.filter((_, i) => i !== c));
          model.align = model.align.filter((_, i) => i !== c);
          render();
          commit();
        });
        th.appendChild(del);
      }
      alignRow.appendChild(th);
    }
    alignRow.appendChild(document.createElement('th'));
    table.appendChild(alignRow);

    // --- データ行 ---
    for (let r = 0; r < rows; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < cols; c++) {
        const cell = document.createElement(r === 0 ? 'th' : 'td');
        const input = document.createElement('input');
        input.type = 'text';
        input.value = model.cells[r][c];
        input.dataset.cell = '';
        input.dataset.row = String(r);
        input.dataset.col = String(c);
        input.addEventListener('change', () => {
          readInputs();
          commit();
        });
        cell.appendChild(input);
        tr.appendChild(cell);
      }
      const ctl = document.createElement('td');
      ctl.className = 've-table-grid-rowctl';
      if (rows > 1 && r > 0) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 've-table-grid-del';
        del.textContent = '−';
        del.title = labels.delRow;
        del.addEventListener('click', () => {
          readInputs();
          model.cells = model.cells.filter((_, i) => i !== r);
          render();
          commit();
        });
        ctl.appendChild(del);
      }
      tr.appendChild(ctl);
      table.appendChild(tr);
    }

    // --- 追加ボタン ---
    const controls = document.createElement('div');
    controls.className = 've-table-grid-controls';
    const addRow = document.createElement('button');
    addRow.type = 'button';
    addRow.textContent = `+ ${labels.addRow}`;
    addRow.addEventListener('click', () => {
      readInputs();
      model.cells.push(Array.from({ length: cols }, () => ''));
      render();
      commit();
    });
    const addCol = document.createElement('button');
    addCol.type = 'button';
    addCol.textContent = `+ ${labels.addCol}`;
    addCol.addEventListener('click', () => {
      readInputs();
      model.cells = model.cells.map((row) => [...row, '']);
      model.align.push('');
      render();
      commit();
    });
    controls.append(addRow, addCol);

    dom.replaceChildren(table, controls);
  }

  render();

  return {
    dom,
    setSource(source: string) {
      if (dom.contains(document.activeElement)) return;
      try {
        model = parse(source);
        render();
      } catch {
        /* 解析できない更新は無視(カードは textarea 側で扱われている想定) */
      }
    },
    hasFocus() {
      return dom.contains(document.activeElement);
    },
    destroy() {
      dom.replaceChildren();
    },
  };
}
