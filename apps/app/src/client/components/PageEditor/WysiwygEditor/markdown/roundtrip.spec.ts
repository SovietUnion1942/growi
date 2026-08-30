import { describe, expect, it } from 'vitest';

import { markdownToDoc } from './parser';
import { docToMarkdown } from './serializer';

const norm = (s: string) =>
  s
    .replace(/\s+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const roundTrip = (src: string) =>
  norm(docToMarkdown(markdownToDoc(src, false)));

const SAMPLES: Record<string, string> = {
  prose: `# 見出し1

これは **太字** と *斜体* と ~~打ち消し~~ と \`コード\` と [リンク](https://example.com) を含む段落です。

## 見出し2

- 箇条書き1
- 箇条書き2
  - ネスト

1. 番号1
2. 番号2

\`\`\`js
const x = 1;
\`\`\`

---
`,
  tasklist: `- [x] 要件定義
- [x] 設計
- [ ] 検証
- [ ] リリース
`,
  directive: `:::important
正式リリースされてやった～！

いい加減にしてほしいですね。
:::

### 新アップデート進捗

:::milestone{title="v3.1 リリース"}
- [x] 要件定義
- [x] 設計
:::

::progress[開発]{value=75 max=100}

:::wiki-gap-suggestions
:::
`,
  growiDollarDirective: `$lsx(/Sandbox, depth=2)

通常の段落。
`,
  frontmatter: `---
title: サンプル
tags:
  - foo
  - bar
---

# 本文

段落。
`,
  html: `<p class="text-bg-success">正式リリース！</p>

通常の段落。
`,
  table: `| 記法 | 見た目 |
|---|---|
| \`::progress\` | バー |
| \`:::milestone\` | チェックリスト |

あとがき。
`,
};

describe('WysiwygEditor markdown round-trip', () => {
  for (const [name, src] of Object.entries(SAMPLES)) {
    it(`${name} is byte-stable through parse -> serialize`, () => {
      expect(roundTrip(src)).toBe(norm(src));
    });
  }
});
