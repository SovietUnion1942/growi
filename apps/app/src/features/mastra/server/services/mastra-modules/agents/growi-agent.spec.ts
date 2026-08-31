import type { MastraModelConfig } from '@mastra/core/llm';
import type { RequestContext } from '@mastra/core/request-context';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MastraRequestContextShape } from '../types/request-context';

// Mock heavy collaborators that the agent module pulls in transitively.
//
// Mastra's `@mastra/core/agent` Agent class triggers a chain of internal
// chunks that import `pMapSkip` from `p-map`. The monorepo pins `p-map@4`
// for Mastra (CommonJS compatibility; see pnpm.overrides in root package.json
// — `"@mastra/core>p-map": "4.0.0"`). v4 has no `pMapSkip` named export, so
// ESM-style import under the unit-test workspace fails at module load.
//
// We don't need a real Agent for shape-checking — we only need to capture the
// constructor configuration that growi-agent.ts hands in. A stub Agent that
// stores the config and exposes it via the same listTools/getInstructions
// surface gives us exactly that, without booting Mastra's runtime.
interface CapturedAgentConfig {
  id?: string;
  name?: string;
  instructions: unknown;
  // `tools` is a DynamicArgument: either a plain record or a function
  // returning one. The stub's listTools() resolves both shapes.
  tools: Record<string, unknown> | (() => Record<string, unknown>);
  model?: unknown;
  memory?: unknown;
}

// Capability flags the agent reads via `getAgentFeatureFlags()`. A hoisted
// mutable holder lets each test choose which capabilities are on; the default
// (all true) keeps the pre-existing "all tools present / prompt is rich" tests
// meaningful without every one of them opting in.
const featureFlags = vi.hoisted(() => ({
  value: { pageEdit: true, pageCreate: true, webSearch: true, vision: true },
}));

vi.mock('../../agent-feature-flags', () => ({
  getAgentFeatureFlags: () => featureFlags.value,
}));

vi.mock('@mastra/core/agent', () => {
  class StubAgent {
    name: string;
    private __config: CapturedAgentConfig;
    constructor(config: CapturedAgentConfig) {
      this.name = config.name ?? config.id ?? 'stub-agent';
      this.__config = config;
    }
    // Mirror the public surface used by callers.
    getInstructions(): unknown {
      return this.__config.instructions;
    }
    listTools(): Record<string, unknown> {
      const t = this.__config.tools;
      return typeof t === 'function' ? t() : t;
    }
    // Test-only accessor: expose the raw constructor config so the spec can
    // read the `model` dynamic function that growi-agent.ts supplied.
    getCapturedConfig(): CapturedAgentConfig {
      return this.__config;
    }
  }
  return { Agent: StubAgent };
});

// Suppress logger noise from any transitively-imported logger consumers.
vi.mock('~/utils/logger', () => ({
  default: () => ({
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  }),
}));

// Replace memory with an inert stub so we don't spin up MongoDBStore.
vi.mock('../memory', () => ({
  memory: { id: 'stub-memory' },
}));

// The resolver is the single seam this module depends on for model supply.
// A hoisted mutable holder lets each test choose the resolution that
// `resolveMastraModel(modelKey?)` returns, while the mock itself stays declared
// once. The mock mirrors the real signature (`modelKey?: string`) so the spec
// can assert which modelKey the agent forwarded.
//
// The real resolveMastraModel is async (it dynamically imports only the selected
// provider's `@ai-sdk/*` SDK), so the mock is async too: the inner `resolverMock.fn`
// stays a plain sync fn whose return value / throw the spec controls, and the async
// wrapper turns a returned value into a resolved Promise and a thrown error into a
// rejected Promise — exactly mirroring the real function's sync-throw-inside-async
// behavior. Because growi-agent.ts resolves the model lazily inside its `model()`
// function (not at import time), changing this between tests is enough to vary
// behavior — no module reset / re-import is required (and re-importing would
// re-register transitive Mongoose models and throw).
const resolverMock = vi.hoisted(() => ({
  fn: vi.fn<(modelKey?: string) => MastraModelConfig>(),
}));

vi.mock('../../ai-sdk-modules/resolve-mastra-model', () => ({
  resolveMastraModel: async (modelKey?: string) => resolverMock.fn(modelKey),
}));

// A sentinel model. The agent's `model()` function must resolve to exactly this
// object when resolution succeeds — proving it forwards the resolver's model
// (via the Promise it returns) rather than constructing one itself.
const sentinelModel = { id: 'sentinel-model' } as unknown as MastraModelConfig;

// Importing growiAgent is the act under test for Req 4.3: module load (and thus
// `new Agent(...)`) must complete WITHOUT calling the resolver. We import while
// the resolver is in a throwing (misconfigured) state and assert below that it
// was never invoked during construction — if it were, the import would throw.
resolverMock.fn.mockImplementation(() => {
  throw new Error('Mastra LLM provider is not configured (set AI_PROVIDER)');
});

import { growiAgent } from './growi-agent';

// Snapshot whether the resolver was touched during the import above.
const resolverCalledDuringImport = resolverMock.fn.mock.calls.length > 0;

// The dynamic model function Mastra invokes per request. It receives the
// request-scoped `{ requestContext }` and returns the resolved model.
type ModelFnArg = { requestContext: RequestContext<MastraRequestContextShape> };
type ModelFn = (arg: ModelFnArg) => Promise<MastraModelConfig>;

// Narrow the captured config's `model` to the dynamic function without an
// assertion of its return value — only the callable shape is asserted.
const getModelFn = (): ModelFn => {
  const config =
    'getCapturedConfig' in growiAgent &&
    typeof growiAgent.getCapturedConfig === 'function'
      ? growiAgent.getCapturedConfig()
      : undefined;
  const model = config?.model;
  if (typeof model !== 'function') {
    throw new Error('Expected the agent model to be a dynamic function');
  }
  return model as ModelFn;
};

// Build the `{ requestContext }` argument the agent's model function expects,
// with `requestContext.get('modelKey')` returning the supplied value. A typed
// stub (no `as any`) keeps the fake aligned with RequestContext's surface; only
// `get` is exercised by the model function.
const makeModelFnArg = (
  modelKey?: string,
  user?: MastraRequestContextShape['user'],
): ModelFnArg => {
  const requestContext = {
    get: (key: string): unknown => {
      if (key === 'modelKey') return modelKey;
      if (key === 'user') return user;
      return undefined;
    },
  } as unknown as RequestContext<MastraRequestContextShape>;
  return { requestContext };
};

describe('growiAgent', () => {
  beforeEach(() => {
    resolverMock.fn.mockReset();
    featureFlags.value = {
      pageEdit: true,
      pageCreate: true,
      webSearch: true,
      vision: true,
    };
  });

  describe('construction (requirement 4.3 — import never throws)', () => {
    it('constructs without invoking the resolver, so a disabled config cannot throw at import', () => {
      // The module was imported (top of file) while the resolver reported
      // disabled. Because model supply is a deferred dynamic function, the
      // import must have succeeded AND never called the resolver (Req 4.3).
      expect(growiAgent).toBeDefined();
      expect(resolverCalledDuringImport).toBe(false);
    });
  });

  describe('model supply (requirements 3.3, 5.1)', () => {
    it('resolves to the resolved model when resolution succeeds', async () => {
      resolverMock.fn.mockReturnValue(sentinelModel);

      const modelFn = getModelFn();

      // The dynamic function forwards exactly the resolver's model (Req 3.3,
      // 5.1) — a single provider's single model, resolved (asynchronously, since
      // the resolver lazily imports the provider SDK) at use time.
      await expect(modelFn(makeModelFnArg())).resolves.toBe(sentinelModel);
    });
  });

  describe('per-request model selection (requirements 4.1, 4.3)', () => {
    it('forwards the requestContext modelKey to the resolver', async () => {
      resolverMock.fn.mockReturnValue(sentinelModel);

      const modelFn = getModelFn();
      await modelFn(makeModelFnArg('openai/gpt-4o-mini'));

      // The observable contract: the modelKey selected for this request
      // (carried on requestContext) is the key the resolver is asked to
      // resolve — so a per-request selection actually reaches model
      // resolution (Req 4.1, 4.3).
      expect(resolverMock.fn).toHaveBeenCalledWith('openai/gpt-4o-mini');
    });

    it('passes undefined to the resolver when no modelKey is set, so the default is used', async () => {
      resolverMock.fn.mockReturnValue(sentinelModel);

      const modelFn = getModelFn();
      await modelFn(makeModelFnArg());

      // When the request carries no modelKey the resolver is invoked with
      // undefined, which it resolves to the effective default (Req 4.3).
      expect(resolverMock.fn).toHaveBeenCalledWith(undefined);
    });
  });

  describe('model supply on misconfiguration (requirement 4.1, 4.3 — rejection surfaces at use time)', () => {
    it('propagates the resolver rejection at use time without swallowing it', async () => {
      // On misconfiguration resolveMastraModel() rejects; the agent's lazy
      // `model()` must let it surface (handled by the post-message route's
      // try/catch — Req 4.4), not swallow or replace it.
      const resolverError = new Error(
        'Mastra LLM API key is not configured for provider "openai" (set AI_API_KEY)',
      );
      resolverMock.fn.mockImplementation(() => {
        throw resolverError;
      });

      const modelFn = getModelFn();

      // Calling the dynamic function in a misconfigured state rejects with the
      // resolver's error, unchanged (Req 4.1).
      const thrown = await modelFn(makeModelFnArg()).catch((e: unknown) => e);
      expect(thrown).toBe(resolverError);
      // Defense-in-depth: the surfaced message carries no secret material.
      const message = thrown instanceof Error ? thrown.message : '';
      expect(message.toLowerCase()).not.toContain('sk-');
    });
  });

  describe('tools registration (requirements 4.1, 6.1)', () => {
    it('exposes fullTextSearchTool and getPageContentTool, and does NOT expose fileSearchTool', async () => {
      // listTools() may be sync (static config) or async (dynamic config).
      // `await` handles both shapes without committing to either.
      const tools = await growiAgent.listTools();
      const toolKeys = Object.keys(tools);

      expect(toolKeys).toContain('fullTextSearchTool');
      expect(toolKeys).toContain('getPageContentTool');
      expect(toolKeys).toContain('getUserBadgesTool');
      expect(toolKeys).toContain('webSearchTool');
      expect(toolKeys).toContain('proposePageEditTool');
      expect(toolKeys).toContain('proposePageCreateTool');
      expect(toolKeys).not.toContain('fileSearchTool');
    });

    it('always exposes the search / read / badge tools regardless of flags', async () => {
      featureFlags.value = {
        pageEdit: false,
        pageCreate: false,
        webSearch: false,
        vision: false,
      };
      const toolKeys = Object.keys(await growiAgent.listTools());
      expect(toolKeys).toEqual(
        expect.arrayContaining([
          'fullTextSearchTool',
          'getPageContentTool',
          'getUserBadgesTool',
        ]),
      );
    });

    it('omits proposePageEditTool / proposePageCreateTool / webSearchTool when their flag is off', async () => {
      featureFlags.value = {
        pageEdit: false,
        pageCreate: false,
        webSearch: false,
        vision: true,
      };
      const toolKeys = Object.keys(await growiAgent.listTools());
      expect(toolKeys).not.toContain('proposePageEditTool');
      expect(toolKeys).not.toContain('proposePageCreateTool');
      expect(toolKeys).not.toContain('webSearchTool');
    });

    it('includes each opt-in tool exactly when its own flag is on', async () => {
      featureFlags.value = {
        pageEdit: true,
        pageCreate: false,
        webSearch: false,
        vision: false,
      };
      const toolKeys = Object.keys(await growiAgent.listTools());
      expect(toolKeys).toContain('proposePageEditTool');
      expect(toolKeys).not.toContain('proposePageCreateTool');
      expect(toolKeys).not.toContain('webSearchTool');
    });
  });

  describe('instructions content (requirement 4.1, FB Issue 2 regression guard)', () => {
    // Type guard that narrows an unknown value to { content: unknown } without
    // a cast. Used in place of `(msg as { content: unknown }).content` inside
    // the .map below — once this guard returns true, TypeScript narrows the
    // variable's static type.
    const hasContentField = (v: unknown): v is { content: unknown } =>
      v != null && typeof v === 'object' && 'content' in v;

    // `instructions` is now a DynamicArgument function (same mechanism as
    // `model`, see getModelFn above) so it can append a per-request identity
    // note. Resolve it here the same way Mastra would at request time,
    // with no logged-in user on the requestContext (the anonymous/base case).
    const resolveInstructions = async (
      user?: MastraRequestContextShape['user'],
    ): Promise<unknown> => {
      const config =
        'getCapturedConfig' in growiAgent &&
        typeof growiAgent.getCapturedConfig === 'function'
          ? growiAgent.getCapturedConfig()
          : undefined;
      const instructions = config?.instructions;
      if (typeof instructions === 'function') {
        return await (
          instructions as (arg: {
            requestContext: RequestContext<MastraRequestContextShape>;
          }) => unknown
        )(makeModelFnArg(undefined, user));
      }
      return instructions;
    };

    const getInstructionsString = async (): Promise<string> => {
      const instructions = await resolveInstructions();
      // The agent declares instructions as a plain string. Defensive guard:
      // if the field is wrapped in an array of messages, flatten to text.
      if (typeof instructions === 'string') return instructions;
      if (Array.isArray(instructions)) {
        return instructions
          .map((msg: unknown) => {
            if (typeof msg === 'string') return msg;
            if (hasContentField(msg)) {
              const content = msg.content;
              return typeof content === 'string' ? content : '';
            }
            return '';
          })
          .join('\n');
      }
      return '';
    };

    it('is a non-empty string', async () => {
      const instructions = await resolveInstructions();
      // typeof check narrows `instructions` to `string` for the next line,
      // so no `as string` cast is needed. The expect on typeof gates the
      // .length read behind the narrowing.
      expect(typeof instructions).toBe('string');
      if (typeof instructions !== 'string') return;
      expect(instructions.length).toBeGreaterThan(0);
    });

    it('appends a note naming the logged-in user when requestContext carries one', async () => {
      const user = {
        username: 'tanaka',
        name: 'Taro Tanaka',
      } as unknown as MastraRequestContextShape['user'];

      const instructions = await resolveInstructions(user);
      expect(typeof instructions).toBe('string');
      if (typeof instructions !== 'string') return;
      expect(instructions).toContain('tanaka');
      expect(instructions).toContain('Taro Tanaka');
    });

    it('omits the identity note when requestContext carries no user', async () => {
      const instructions = await resolveInstructions(undefined);
      expect(typeof instructions).toBe('string');
      if (typeof instructions !== 'string') return;
      expect(instructions).not.toContain('WHO YOU ARE TALKING TO');
    });

    it('includes the current date/time, reflecting the actual clock, regardless of user presence', async () => {
      // Pin the clock to a known instant so the assertion proves the note is
      // computed fresh per call (not a hardcoded string) — a fixed date that
      // renders unambiguously in JST regardless of the test runner's own
      // timezone.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2027-03-04T01:30:00Z')); // 2027-03-04 10:30 JST

      try {
        const withoutUser = await resolveInstructions(undefined);
        const withUser = await resolveInstructions({
          username: 'tanaka',
        } as unknown as MastraRequestContextShape['user']);

        for (const instructions of [withoutUser, withUser]) {
          expect(typeof instructions).toBe('string');
          if (typeof instructions !== 'string') continue;
          expect(instructions).toContain('CURRENT DATE AND TIME');
          expect(instructions).toContain('2027');
          expect(instructions).toContain('03');
          expect(instructions).toContain('04');
        }
      } finally {
        vi.useRealTimers();
      }
    });

    it("appends the user's badges (with level) to the identity note when badgeSummaryCached has entries", async () => {
      const user = {
        username: 'tanaka',
        name: 'Taro Tanaka',
        badgeSummaryCached: [
          { name: 'Wiki Editor', level: 3 },
          { name: 'Community Helper', level: null },
        ],
      } as unknown as MastraRequestContextShape['user'];

      const instructions = await resolveInstructions(user);
      expect(typeof instructions).toBe('string');
      if (typeof instructions !== 'string') return;
      expect(instructions).toContain('Wiki Editor (level 3)');
      expect(instructions).toContain('Community Helper');
      // A null-level (manual) badge must not render a "(level null)" suffix.
      expect(instructions).not.toContain('Community Helper (level');
    });

    it('does not mention badges in the identity note when badgeSummaryCached is empty or absent', async () => {
      const userWithNoBadges = {
        username: 'tanaka',
        name: 'Taro Tanaka',
        badgeSummaryCached: [],
      } as unknown as MastraRequestContextShape['user'];
      const userWithUndefinedBadges = {
        username: 'suzuki',
        name: 'Jiro Suzuki',
      } as unknown as MastraRequestContextShape['user'];

      const instructionsEmpty = await resolveInstructions(userWithNoBadges);
      const instructionsUndefined = await resolveInstructions(
        userWithUndefinedBadges,
      );
      expect(typeof instructionsEmpty).toBe('string');
      expect(typeof instructionsUndefined).toBe('string');
      if (
        typeof instructionsEmpty !== 'string' ||
        typeof instructionsUndefined !== 'string'
      ) {
        return;
      }
      expect(instructionsEmpty).not.toContain('earned the following badge');
      expect(instructionsUndefined).not.toContain('earned the following badge');
    });

    // Substring-presence assertions on instruction wording (cite-path order,
    // query operator list, outline/offset/hasMore drill-down) were removed
    // intentionally: they made every prompt iteration a test-maintenance
    // chore without catching real defects. Instruction phrasing is verified
    // by exercising the agent end-to-end, not by string-matching here.

    it('includes the EDITING / CREATING / WEB / IMAGES sections when every flag is on', async () => {
      const instructions = await getInstructionsString();
      expect(instructions).toContain('# EDITING PAGES');
      expect(instructions).toContain('# CREATING NEW PAGES');
      expect(instructions).toContain('# SEARCHING THE WEB');
      expect(instructions).toContain('# IMAGES ATTACHED TO THE CONVERSATION');
    });

    it('drops each capability section when its flag is off, keeping BASE and PRIOR CONTEXT', async () => {
      featureFlags.value = {
        pageEdit: false,
        pageCreate: false,
        webSearch: false,
        vision: false,
      };
      const instructions = await getInstructionsString();
      expect(instructions).not.toContain('# EDITING PAGES');
      expect(instructions).not.toContain('# CREATING NEW PAGES');
      expect(instructions).not.toContain('# PROACTIVELY SUGGESTING A NEW PAGE');
      expect(instructions).not.toContain('# SEARCHING THE WEB');
      expect(instructions).not.toContain(
        '# IMAGES ATTACHED TO THE CONVERSATION',
      );
      // still a usable prompt
      expect(instructions).toContain('CRITICAL INSTRUCTION');
      expect(instructions).toContain(
        '# PRIOR CONVERSATION CONTEXT AUTOMATICALLY INCLUDED IN YOUR INPUT',
      );
    });

    it('contains NO uncommented "Use the fileSearch tool" line (FB Issue 2)', async () => {
      const instructions = await getInstructionsString();

      // Split, trim, then identify any line that — after stripping a leading
      // `-` bullet marker — begins with "Use the fileSearch tool" AND is NOT
      // commented out via `//` or `<!--`. The fileSearch tool has been removed
      // from the agent, so no such line should exist; an uncommented variant is
      // the regression we guard against.
      const lines = instructions.split('\n').map((l) => l.trim());

      const uncommentedFileSearchLines = lines.filter((line) => {
        // Treat a line as commented out if it begins with `//` or `<!--`.
        if (line.startsWith('//')) return false;
        if (line.startsWith('<!--')) return false;

        // Strip a leading bullet marker so "- Use the fileSearch ..." also
        // matches. The presence of the substring at the start (after the
        // bullet) is what we forbid.
        const withoutBullet = line.replace(/^-\s*/, '');
        return withoutBullet.startsWith('Use the fileSearch tool');
      });

      expect(uncommentedFileSearchLines).toHaveLength(0);
    });
  });
});
