/**
 * 共通の先頭/末尾「行」を除いた最小差分の 1 レンジ(文字オフセット)を返す。
 * 文字単位ではなく行境界にスナップさせることで、遠隔編集と交錯しても
 * 1 レンジが行頭で切れて破壊的な結合を起こしにくくする。
 * CodeMirror の `view.dispatch({ changes: { from, to, insert } })` にそのまま渡せる。
 */
export function lineDiffRange(
  before: string,
  after: string,
): { from: number; to: number; insert: string } {
  if (before === after) {
    return { from: 0, to: 0, insert: '' };
  }
  const a = before.split('\n');
  const b = after.split('\n');

  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;

  let tailA = a.length;
  let tailB = b.length;
  while (tailA > head && tailB > head && a[tailA - 1] === b[tailB - 1]) {
    tailA--;
    tailB--;
  }

  const offsetOfLine = (lines: string[], idx: number): number => {
    let pos = 0;
    for (let i = 0; i < idx; i++) pos += lines[i].length + 1; // + '\n'
    return pos;
  };

  const from = offsetOfLine(a, head);
  const to = tailA >= a.length ? before.length : offsetOfLine(a, tailA);
  const insertEnd = tailB >= b.length ? after.length : offsetOfLine(b, tailB);
  return { from, to, insert: after.slice(from, insertEnd) };
}
