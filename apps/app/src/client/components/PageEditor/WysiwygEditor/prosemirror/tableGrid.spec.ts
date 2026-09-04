import { MarkdownTable } from '@growi/editor';
import { describe, expect, it } from 'vitest';

import { markdownToDoc } from '../markdown/parser';
import { docToMarkdown } from '../markdown/serializer';

/**
 * グリッド編集は MarkdownTable でのパース → セル/整列を変更 → 再シリアライズ。
 * 手書きソースとの byte 一致は求めず「2 回目のパースで冪等」であることを検証する。
 */
const throughWysiwyg = (md: string) =>
  docToMarkdown(markdownToDoc(md, false)).trim();

const rebuild = (cells: string[][], align: string[]) =>
  new MarkdownTable(
    cells.map((r) => r.slice()),
    { align: align.slice(), pad: true },
  )
    .normalizeCells()
    .toString();

const BASE = `| Name | Value |
|---|---|
| a | 1 |
| b | 2 |
`;

describe('table grid editing', () => {
  it('untouched table is byte-stable through the WYSIWYG pipeline', () => {
    expect(throughWysiwyg(BASE)).toBe(BASE.trim());
  });

  it('edited cell round-trips and is idempotent on a 2nd pass', () => {
    const mt = MarkdownTable.fromMarkdownString(BASE);
    const cells: string[][] = mt.table.map((r: unknown[]) =>
      r.map((c) => (c == null ? '' : String(c))),
    );
    cells[1][1] = '999';
    const align = (mt.options.align as string[]).map((a) =>
      a === 'l' || a === 'c' || a === 'r' ? a : '',
    );
    const edited = rebuild(cells, align);

    const once = throughWysiwyg(edited);
    const twice = throughWysiwyg(once);
    expect(twice).toBe(once);
    expect(once).toContain('999');
  });

  it('added row + column alignment survive round-trip idempotently', () => {
    const mt = MarkdownTable.fromMarkdownString(BASE);
    const cells: string[][] = mt.table.map((r: unknown[]) =>
      r.map((c) => (c == null ? '' : String(c))),
    );
    cells.push(['c', '3']);
    const align = ['', 'r'];
    const edited = rebuild(cells, align);

    const once = throughWysiwyg(edited);
    expect(throughWysiwyg(once)).toBe(once);
    expect(once).toContain('| c ');
  });
});
