import type { IUser } from '@growi/core/dist/interfaces';

import { pageListingService } from '~/server/service/page-listing';

import { esc } from './html';

type TreeNode = { path: string; isEmpty: boolean };

const basename = (path: string): string => {
  if (path === '/') {
    return '/';
  }
  const segs = path.replace(/\/$/, '').split('/');
  return decodeURIComponent(segs[segs.length - 1] ?? path);
};

const li = (node: TreeNode, current: string): string => {
  const label = esc(basename(node.path));
  const href = esc(`${node.path}?ui=lite`);
  const inner =
    node.path === current
      ? `<strong>${label}</strong>`
      : `<a href="${href}">${label}</a>`;
  return `<li>${inner}`;
};

/**
 * A contextual page tree for the lite view: every ancestor level of the current
 * page is listed, with the on-path node expanded down to the current page's own
 * direct children. Avoids loading the whole tree while still giving the reader
 * somewhere to navigate. Rendered as a plain nested `<ul>` — no JS, no toggles.
 */
export const buildLiteTree = async (
  currentPath: string,
  user: IUser | undefined,
): Promise<string> => {
  // Ancestor paths from '/' down to (and including) the current page.
  const ancestors: string[] = ['/'];
  if (currentPath !== '/') {
    const segs = currentPath.replace(/^\/|\/$/g, '').split('/');
    let acc = '';
    for (const s of segs) {
      acc += `/${s}`;
      ancestors.push(acc);
    }
  }

  const renderLevel = async (
    parentPath: string,
    depth: number,
  ): Promise<string> => {
    let children: TreeNode[];
    try {
      const rows =
        await pageListingService.findChildrenByParentPathOrIdAndViewer(
          parentPath,
          user,
        );
      children = rows
        .map((r) => ({ path: r.path ?? '', isEmpty: Boolean(r.isEmpty) }))
        .filter((r) => r.path.length > 0)
        .sort((a, b) => a.path.localeCompare(b.path));
    } catch {
      return '';
    }
    if (children.length === 0) {
      return '';
    }

    const items = await Promise.all(
      children.map(async (child) => {
        const onPath = ancestors.includes(child.path);
        const sub =
          onPath && depth < ancestors.length
            ? await renderLevel(child.path, depth + 1)
            : '';
        return `${li(child, currentPath)}${sub}</li>`;
      }),
    );
    return `<ul>${items.join('')}</ul>`;
  };

  const body = await renderLevel('/', 1);
  return `<nav class="lite-tree" aria-label="ページツリー"><a href="/?ui=lite">/</a>${body}</nav>`;
};
