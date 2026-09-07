import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard for the "backdrop-filter is safe on the sidebar" invariant.
 *
 * The modern-UI skin (styles/modern-ui/_surfaces.scss) puts a real
 * `backdrop-filter` on the sidebar rail / panel / collapsed popout. A non-none
 * `backdrop-filter` makes the element a containing block for its
 * `position: fixed` descendants — so if any `FloatingPanel` (Messages thread,
 * AI chat) or the `FloatingPanelDock` were rendered *inside* the sidebar
 * subtree, the blur would trap/clip it against the sidebar instead of the
 * viewport (this exact bug shipped twice before the panels were hoisted).
 *
 * These assertions keep the panels mounted at `BasicLayout` top level and out
 * of the sidebar, so the blur stays safe.
 */

const SRC = join(import.meta.dirname, '../../..');

const collectTsx = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsx(p));
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.spec\.tsx?$/.test(entry.name)
    ) {
      out.push(p);
    }
  }
  return out;
};

describe('FloatingPanel mount location', () => {
  it('BasicLayout renders the Messages thread, AI chat and the dock at top level', () => {
    const basicLayout = readFileSync(
      join(SRC, 'components/Layout/BasicLayout.tsx'),
      'utf8',
    );
    expect(basicLayout).toMatch(/<MessagesFloatingThreadLazyLoaded\b/);
    expect(basicLayout).toMatch(/<ChatSidebarLazyLoaded\b/);
    expect(basicLayout).toMatch(/<FloatingPanelDock\b/);
  });

  it('no component actually rendered inside the sidebar tree renders a FloatingPanel', () => {
    // `MessagesFloatingThread.tsx` lives under Sidebar/Messages/ for code
    // organisation but is mounted at BasicLayout top level (asserted above),
    // NOT as a child of the sidebar DOM — so it is allowed to render the panel.
    const HOISTED = new Set(['MessagesFloatingThread.tsx']);

    const offenders = collectTsx(join(SRC, 'client/components/Sidebar'))
      .filter((file) => {
        if (HOISTED.has(file.split('/').pop() ?? '')) {
          return false;
        }
        const src = readFileSync(file, 'utf8');
        // JSX usage of the panel — an `import` alone (e.g. a shared type) is fine.
        return /<FloatingPanel[\s/>]/.test(src);
      })
      .map((file) => file.replace(SRC, 'src'));

    expect(offenders).toEqual([]);
  });
});
