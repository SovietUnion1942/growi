import type { NextFunction, Response } from 'express';

import type { CrowiRequest } from '~/interfaces/crowi-request';
import { normalizeModernUiMode } from '~/interfaces/modern-ui-mode';
import { resolveUiTier } from '~/interfaces/ui-tier';
import type Crowi from '~/server/crowi';
import { configManager } from '~/server/service/config-manager';
import { findPageAndMetaDataByViewer } from '~/server/service/page/find-page-and-meta-data-by-viewer';
import loggerFactory from '~/utils/logger';

import { buildLiteTree } from '../build-lite-tree';
import { esc } from '../html';
import { renderLiteLayout } from '../lite-layout';
import { renderLiteMarkdown } from '../render-lite-markdown';

const logger = loggerFactory('growi:features:lite-ui:routes');

type Handler = (
  req: CrowiRequest,
  res: Response,
  next: NextFunction,
) => void | Promise<void>;

export interface LiteUiHandlers {
  /** Gate: continue only when this request resolves to the `lite` tier. */
  readonly skipUnlessLiteTier: Handler;
  /** Responder for a wiki page path. */
  readonly renderPage: Handler;
  /** Responder for `/_lite/search`. */
  readonly renderSearch: Handler;
}

// Paths the lite render must not claim — these are SPA-only tools / auth flows
// that fall through to the Next delegate even in the lite tier.
const RESERVED_PREFIXES = [
  '/_',
  '/admin',
  '/me',
  '/trash',
  '/tags',
  '/installer',
  '/login',
  '/logout',
  '/register',
  '/invited',
  '/share',
  '/forgot-password',
  '/reset-password',
  '/user-activation',
  '/nas',
  '/board',
  '/attachment',
  '/analytics',
];

const isReservedPath = (path: string): boolean =>
  RESERVED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

const resolveTier = (req: CrowiRequest): string =>
  resolveUiTier({
    mode: normalizeModernUiMode(configManager.getConfig('app:modernUiMode')),
    cookie: req.cookies?.['grw-ui'],
    ua: req.headers['user-agent'],
  });

const buildCrumbs = (path: string): string => {
  if (path === '/') {
    return '<a href="/?ui=lite">/</a>';
  }
  const segs = path.replace(/^\/|\/$/g, '').split('/');
  let acc = '';
  const parts = segs.map((s, i) => {
    acc += `/${s}`;
    const label = esc(decodeURIComponent(s));
    return i === segs.length - 1
      ? label
      : `<a href="${esc(`${acc}?ui=lite`)}">${label}</a>`;
  });
  return `<a href="/?ui=lite">/</a> ${parts.join(' / ')}`;
};

const stripTags = (s: string): string => s.replace(/<[^>]*>/g, '');

export const createLiteUiHandlers = (crowi: Crowi): LiteUiHandlers => {
  const siteName = (): string => crowi.appService?.getAppTitle?.() ?? 'GROWI';

  const skipUnlessLiteTier: Handler = (req, _res, next) => {
    if (req.method !== 'GET' || resolveTier(req) !== 'lite') {
      return next('route');
    }
    next();
  };

  const renderPage: Handler = async (req, res, next) => {
    const path = decodeURIComponent(req.path);
    if (isReservedPath(path)) {
      return next('route');
    }

    try {
      const { data: page, meta } = await findPageAndMetaDataByViewer(
        crowi.pageService,
        crowi.pageGrantService,
        { pageId: null, path, user: req.user ?? undefined, basicOnly: true },
      );

      const tree = await buildLiteTree(path, req.user ?? undefined);
      const crumbs = buildCrumbs(path);

      if (page == null) {
        const notFound =
          meta != null && 'isForbidden' in meta && meta.isForbidden
            ? '<h1>アクセスできません</h1><p>このページを表示する権限がありません。</p>'
            : `<h1>ページがありません</h1><p><code>${esc(path)}</code> はまだ作成されていません。</p>`;
        res
          .status(page == null ? 404 : 200)
          .type('html')
          .send(
            renderLiteLayout({
              title: path,
              siteName: siteName(),
              crumbsHtml: crumbs,
              bodyHtml: notFound,
              treeHtml: tree,
            }),
          );
        return;
      }

      page.initLatestRevisionField(undefined);
      const populated = await page.populateDataToShowRevision(false);
      const body = populated?.revision?.body ?? '';
      const contentHtml = await renderLiteMarkdown(body);

      res.type('html').send(
        renderLiteLayout({
          title: path === '/' ? siteName() : decodeURIComponent(path),
          siteName: siteName(),
          crumbsHtml: crumbs,
          bodyHtml: `<article class="wiki">${contentHtml}</article>`,
          treeHtml: tree,
        }),
      );
    } catch (err) {
      logger.error('lite page render failed', err);
      next(err);
    }
  };

  const renderSearch: Handler = async (req, res) => {
    const q =
      typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
    const tree = await buildLiteTree('/', req.user ?? undefined);

    if (q.length === 0) {
      res.type('html').send(
        renderLiteLayout({
          title: '検索',
          siteName: siteName(),
          crumbsHtml: '<a href="/?ui=lite">/</a> 検索',
          bodyHtml:
            '<h1>検索</h1><p>上のボックスにキーワードを入力してください。</p>',
          treeHtml: tree,
        }),
      );
      return;
    }

    let itemsHtml = '<p>検索は利用できません。</p>';
    try {
      const { searchService } = crowi;
      if (searchService?.isReachable) {
        const [raw, delegatorName] = await searchService.searchKeyword(
          q,
          null,
          req.user ?? undefined,
          null,
          { limit: 30, offset: 0 },
        );
        const formatted = await searchService.formatSearchResult(
          raw,
          delegatorName,
          req.user ?? undefined,
          null,
        );
        const rows = formatted.data ?? [];
        itemsHtml =
          rows.length === 0
            ? '<p>一致するページはありませんでした。</p>'
            : `<ol class="lite-results">${rows
                .map((row) => {
                  const p = esc(row.data.path ?? '');
                  const snippet = row.meta?.elasticSearchResult?.snippet;
                  const sn =
                    typeof snippet === 'string' && snippet.length > 0
                      ? `<div class="lite-snippet">${esc(stripTags(snippet)).slice(0, 300)}</div>`
                      : '';
                  return `<li><a href="${esc(`${row.data.path}?ui=lite`)}">${p}</a>${sn}</li>`;
                })
                .join('')}</ol>`;
      }
    } catch (err) {
      logger.error('lite search failed', err);
      itemsHtml = '<p>検索中にエラーが発生しました。</p>';
    }

    res.type('html').send(
      renderLiteLayout({
        title: `${q} の検索結果`,
        siteName: siteName(),
        crumbsHtml: '<a href="/?ui=lite">/</a> 検索',
        bodyHtml: `<h1>「${esc(q)}」の検索結果</h1>${itemsHtml}`,
        treeHtml: tree,
        query: q,
      }),
    );
  };

  return { skipUnlessLiteTier, renderPage, renderSearch };
};
