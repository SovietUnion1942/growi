import { esc } from './html';

/**
 * The entire lite stylesheet — inlined, no webfonts, no icon fonts. Kept small
 * on purpose (the lite tier targets clients where every KB and every repaint
 * costs). Light + dark via prefers-color-scheme only; there is no toggle.
 */
const LITE_CSS = `
:root{--bg:#fff;--fg:#1a1a1a;--muted:#5a5a5a;--link:#0a6a94;--line:#d8d8d8;--card:#f6f8fa}
@media(prefers-color-scheme:dark){:root{--bg:#14181c;--fg:#d7dde2;--muted:#9aa4ad;--link:#5fb6dd;--line:#2c343b;--card:#1b2127}}
*{box-sizing:border-box}
html{font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
body{margin:0;background:var(--bg);color:var(--fg)}
a{color:var(--link)}
.lite-wrap{max-width:44rem;margin:0 auto;padding:1rem}
.lite-bar{display:flex;flex-wrap:wrap;gap:.5rem 1rem;align-items:baseline;border-bottom:1px solid var(--line);padding-bottom:.5rem;margin-bottom:1rem}
.lite-bar form{margin-left:auto}
.lite-bar input[type=search]{font:inherit;padding:.25rem .4rem;border:1px solid var(--line);background:var(--bg);color:var(--fg)}
.lite-crumbs{font-size:.9rem;color:var(--muted)}
.lite-crumbs a{color:var(--muted)}
h1,h2,h3,h4{line-height:1.3;margin:1.4em 0 .5em}
h1{font-size:1.6rem}h2{font-size:1.3rem}h3{font-size:1.1rem}
pre,code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
pre{background:var(--card);padding:.75rem;overflow-x:auto;border:1px solid var(--line)}
code{background:var(--card);padding:.1em .3em}
pre code{background:none;padding:0}
blockquote{margin:1em 0;padding:.1em 1em;border-left:3px solid var(--line);color:var(--muted)}
table{border-collapse:collapse;width:100%;margin:1em 0}
th,td{border:1px solid var(--line);padding:.35rem .5rem;text-align:left}
img{max-width:100%}
.lite-img-link{display:inline-block;padding:.15em .4em;background:var(--card);border:1px solid var(--line)}
hr{border:0;border-top:1px solid var(--line)}
.lite-tree{font-size:.9rem;border:1px solid var(--line);background:var(--card);padding:.5rem .75rem;margin:1.5rem 0}
.lite-tree ul{margin:.2rem 0;padding-left:1.1rem}
.lite-tree li{margin:.15rem 0}
.lite-foot{border-top:1px solid var(--line);margin-top:2rem;padding-top:.75rem;font-size:.85rem;color:var(--muted)}
.lite-results li{margin:.6rem 0}
.lite-snippet{color:var(--muted);font-size:.9rem}
`.replace(/\n+/g, '');

type LiteLayoutArgs = {
  title: string;
  siteName: string;
  /** Trusted HTML for the top-bar left side (breadcrumb). */
  crumbsHtml: string;
  /** Trusted HTML body (already sanitized for page content, built for search). */
  bodyHtml: string;
  /** Trusted HTML for the nav tree, or '' to omit. */
  treeHtml: string;
  /** Prefill for the search box. */
  query?: string;
};

export const renderLiteLayout = (args: LiteLayoutArgs): string => {
  const { title, siteName, crumbsHtml, bodyHtml, treeHtml, query = '' } = args;
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} - ${esc(siteName)}</title>
<style>${LITE_CSS}</style>
</head>
<body>
<div class="lite-wrap">
<div class="lite-bar">
<span class="lite-crumbs">${crumbsHtml}</span>
<form action="/_lite/search" method="get">
<input type="hidden" name="ui" value="lite">
<input type="search" name="q" value="${esc(query)}" placeholder="検索" aria-label="検索">
<button type="submit">検索</button>
</form>
</div>
<main>
${bodyHtml}
</main>
${treeHtml}
<footer class="lite-foot">
${esc(siteName)} ・ 軽量表示（JavaScript なし）・
<a href="${esc('/?ui=auto')}">通常版に切り替え</a>
</footer>
</div>
</body>
</html>`;
};
