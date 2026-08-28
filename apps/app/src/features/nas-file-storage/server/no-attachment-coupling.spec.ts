import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Contract --------------------------------------------------------------
//
// The nas-file-storage feature is deliberately decoupled from GROWI's existing
// attachment stack (requirements 1.5, 6.6, 7.1, 7.4; design "Out of Boundary"
// and "Security Considerations -> 既存境界の不可侵"). No module under the
// feature may reach into:
//
//   - the `Attachment` mongoose model               (~/server/models/attachment)
//   - the attachment file-uploader service           (~/server/service/file-uploader[/*])
//   - the attachment apiv3 route                      (~/server/routes/apiv3/attachment)
//   - the share-link publishing stack                (~/server/models/share-link,
//                                                      ~/server/routes/apiv3/share-links)
//
// This spec is a lightweight lexical drift guard: it scans every non-test
// source file under the feature for import / export-from / dynamic-import /
// require specifiers and fails if any of them resolves to one of the banned
// modules. It intentionally also catches `import type` — the boundary is about
// conceptual coupling, not only runtime cost, and a type dependency on the
// attachment model is still a boundary violation the reviewer should see.
//
// A pure `~/`-alias / relative specifier match is enough here (unlike the
// boot-time heavy-package guards that use the static-import-graph walker):
// the banned targets are internal modules, not npm packages, so there is no
// external specifier to trace — a direct textual match on the specifier is
// both sufficient and far cheaper.

const FEATURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

// Banned targets. Keep this list flat and clearly labelled so it is easy to
// extend when a new "existing boundary" needs protecting. Each entry is tested
// against the tail of every import specifier (after stripping a `~/` / relative
// prefix and any `.js` / `.jsx` extension).
const BANNED_MODULE_PATTERNS: readonly { label: string; test: RegExp }[] = [
  {
    label: 'Attachment mongoose model',
    test: /(?:^|\/)server\/models\/attachment$/,
  },
  {
    label: 'attachment file-uploader service',
    test: /(?:^|\/)server\/service\/file-uploader(?:$|\/)/,
  },
  {
    label: 'attachment apiv3 route',
    test: /(?:^|\/)server\/routes\/apiv3\/attachment$/,
  },
  {
    label: 'share-link model',
    test: /(?:^|\/)server\/models\/share-link$/,
  },
  {
    label: 'share-link publishing apiv3 route',
    test: /(?:^|\/)server\/routes\/apiv3\/share-links$/,
  },
];

// Matches: `import ... from 'x'`, `export ... from 'x'`, bare `import 'x'`,
// dynamic `import('x')`, and `require('x')`. Type-only imports are matched too
// (see Contract note above).
const SPECIFIER_RE =
  /(?:^|[\s;])(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)|(?:^|[\s;])import\s+['"]([^'"]+)['"]/gm;

const isTestFile = (file: string): boolean =>
  /\.(?:spec|integ)\.[cm]?[jt]sx?$/.test(file);

const isSourceFile = (file: string): boolean => /\.[cm]?[jt]sx?$/.test(file);

const collectSourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (
      entry.isFile() &&
      isSourceFile(entry.name) &&
      !isTestFile(entry.name)
    ) {
      out.push(full);
    }
  }
  return out;
};

const normalizeSpecifier = (specifier: string): string =>
  specifier.replace(/\.[cm]?jsx?$/, '');

type Violation = {
  readonly file: string;
  readonly specifier: string;
  readonly bannedLabel: string;
};

const findViolations = (): Violation[] => {
  const violations: Violation[] = [];
  for (const file of collectSourceFiles(FEATURE_ROOT)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(SPECIFIER_RE)) {
      const raw = match[1] ?? match[2] ?? match[3] ?? match[4];
      if (raw == null) continue;
      const specifier = normalizeSpecifier(raw);
      for (const banned of BANNED_MODULE_PATTERNS) {
        if (banned.test.test(specifier)) {
          violations.push({
            file: path.relative(FEATURE_ROOT, file),
            specifier: raw,
            bannedLabel: banned.label,
          });
        }
      }
    }
  }
  return violations;
};

describe('nas-file-storage: no coupling to the existing attachment / share-link boundary', () => {
  it('scans a non-trivial number of feature source files (guards against a vacuous pass)', () => {
    // If the feature dir were renamed/emptied this walk would silently find
    // nothing and every assertion below would pass for the wrong reason.
    expect(collectSourceFiles(FEATURE_ROOT).length).toBeGreaterThan(5);
  });

  it('does not import any banned module from any non-test feature file', () => {
    const violations = findViolations();
    const formatted = violations.map(
      (v) => `  ${v.file}\n    imports "${v.specifier}" (${v.bannedLabel})`,
    );
    expect(
      formatted,
      'nas-file-storage must not import the Attachment model, the file-uploader ' +
        'service, the attachment apiv3 route, or the share-link publishing stack.\n' +
        'Offending imports:\n' +
        formatted.join('\n'),
    ).toEqual([]);
  });

  it.each(
    BANNED_MODULE_PATTERNS.map((b) => b.label),
  )('has no feature import of: %s', (label) => {
    const hits = findViolations().filter((v) => v.bannedLabel === label);
    expect(hits.map((h) => `${h.file} -> ${h.specifier}`)).toEqual([]);
  });
});
