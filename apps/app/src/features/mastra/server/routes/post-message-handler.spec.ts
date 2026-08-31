// --- Mock boundary ---------------------------------------------------------
//
// These tests exercise the post-message ROUTE HANDLER's observable contract for
// model selection (Req 4.3, 4.6): what it forwards to the model resolver and to
// growiAgent.stream, NOT how the model is actually resolved (effective-model-key /
// resolve-provider-options own that, tested separately).
//
// We mock every module boundary the handler reaches so no real LLM is called:
//   - effective-model-key.resolveEffectiveModelKey: the single allow-list rounding
//     checkpoint — assert the route resolves the request's modelKey through it
//     EXACTLY once and threads the resolved key to both requestContext and the
//     options lookup (an out-of-available-set key is rounded to the default).
//   - resolve-provider-options.getProviderOptionsForModel: assert the route looks
//     up options for the RESOLVED key and passes them straight through to stream.
//   - mastra-modules: a stub growiAgent whose stream() records its options arg.
//   - get-or-create-thread: a fixed thread (thread plumbing is out of scope here).
//   - the `ai` package + @mastra/ai-sdk: stubbed so the handler can run to the
//     point where it pipes a stream, without a real UI message stream.
//   - chat-error-message: spied (not rewritten) so we can confirm the error path
//     stays wired to the existing sanitizer (Req 4.5).
import type { IUserHasId } from '@growi/core';
import type { Request, RequestHandler } from 'express';
import { mock } from 'vitest-mock-extended';

import type Crowi from '~/server/crowi';
import type { ApiV3Response } from '~/server/routes/apiv3/interfaces/apiv3-response';

const { resolveEffectiveModelKey, getProviderOptionsForModel, featureFlags } =
  vi.hoisted(() => ({
    resolveEffectiveModelKey: vi.fn(),
    getProviderOptionsForModel: vi.fn(),
    featureFlags: {
      value: {
        pageEdit: true,
        pageCreate: true,
        webSearch: true,
        vision: true,
      },
    },
  }));
vi.mock('../services/ai-sdk-modules/llm-providers/effective-model-key', () => ({
  resolveEffectiveModelKey,
}));
vi.mock('../services/ai-sdk-modules/resolve-provider-options', () => ({
  getProviderOptionsForModel,
}));
// The route reads agent capability flags to decide whether to strip image
// parts. A hoisted mutable holder (default: vision on) keeps the
// model-selection tests on the pass-through path without loading real config,
// while the vision-strip test flips it.
vi.mock('../services/agent-feature-flags', () => ({
  getAgentFeatureFlags: () => featureFlags.value,
}));

const { stream, getMemory, getOrCreateThread } = vi.hoisted(() => ({
  stream: vi.fn(),
  getMemory: vi.fn(),
  getOrCreateThread: vi.fn(),
}));
vi.mock('../services/mastra-modules', () => ({
  mastra: {
    getAgent: () => ({ getMemory, stream }),
  },
}));
vi.mock('../services/get-or-create-thread', () => ({
  getOrCreateThread,
}));

// The validator chain (buildPostMessageValidator) needs express-validator's
// runtime, which cannot resolve lodash in this sandbox. We invoke the handler
// (the last middleware) directly, so stub the chain builder to keep the factory
// import side-effect-free.
vi.mock('./post-message-validator', () => ({
  buildPostMessageValidator: () => [],
}));

// `ai` is mocked so the handler can build/pipe a stream without a real one.
const { resolveChatErrorMessage } = vi.hoisted(() => ({
  resolveChatErrorMessage: vi.fn((): string => 'SAFE_MESSAGE'),
}));
vi.mock('./chat-error-message', () => ({ resolveChatErrorMessage }));

// Typed shape of the single argument the handler passes to createUIMessageStream,
// so its `onError` hook is introspectable in the error-path test.
type CreateUIMessageStreamArg = {
  originalMessages: unknown;
  onError: (error: unknown) => string;
  execute: (ctx: { writer: unknown }) => Promise<void>;
};
const { createUIMessageStream, pipeUIMessageStreamToResponse } = vi.hoisted(
  () => ({
    createUIMessageStream: vi.fn((_arg: CreateUIMessageStreamArg) => ({})),
    pipeUIMessageStreamToResponse: vi.fn(),
  }),
);
vi.mock('ai', () => ({
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
  validateUIMessages: vi.fn(),
}));
vi.mock('@mastra/ai-sdk', () => ({
  toAISdkStream: vi.fn(),
}));

vi.mock('~/server/middlewares/access-token-parser', () => ({
  accessTokenParser: () => vi.fn(),
}));
vi.mock('~/server/middlewares/login-required', () => ({
  default: () => vi.fn(),
}));
vi.mock('~/server/middlewares/apiv3-form-validator', () => ({
  apiV3FormValidator: vi.fn(),
}));
vi.mock('~/utils/logger', () => ({
  default: () => ({
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { RequestContext } from '@mastra/core/request-context';

import { postMessageHandlersFactory } from './post-message';

// The handler under test is the last middleware in the factory array.
const getHandler = (): RequestHandler => {
  const crowi = mock<Crowi>();
  const handlers = postMessageHandlersFactory(crowi);
  return handlers[handlers.length - 1];
};

const buildReqRes = (modelKey?: string) => {
  const user = mock<IUserHasId>();
  user._id = mock<IUserHasId['_id']>();
  user._id.toString = () => 'user-1';

  // Typed as a full express Request (+ the handler's `user`) so it satisfies
  // RequestHandler's parameter with no cast; the handler reads modelKey via
  // destructuring, so a concrete body is provided (rather than auto-stubbed).
  const req = mock<Request & { user: IUserHasId }>({
    body: {
      threadId: undefined,
      modelKey,
      messages: [{ id: '1', role: 'user', parts: [] }],
    },
    user,
  });
  const res = mock<ApiV3Response>();
  return { req, res };
};

// Invoke the route handler with the typed req/res mocks. The handler is exposed as
// a generic express RequestHandler; the mocks are typed to that signature's
// parameters (Request / Response), so the call needs no cast.
const invoke = (
  req: ReturnType<typeof buildReqRes>['req'],
  res: ReturnType<typeof buildReqRes>['res'],
): void | Promise<void> => getHandler()(req, res, vi.fn());

beforeEach(() => {
  vi.clearAllMocks();
  featureFlags.value = {
    pageEdit: true,
    pageCreate: true,
    webSearch: true,
    vision: true,
  };
  getMemory.mockResolvedValue({});
  getOrCreateThread.mockResolvedValue({ id: 'thread-1', resourceId: 'user-1' });
  // stream resolves to a usable stub: a readable-like + usage promise.
  stream.mockResolvedValue({
    usage: Promise.resolve({}),
  });
});

describe('post-message handler — model selection (Req 4.3, 4.6)', () => {
  it('resolves an in-set modelKey once and threads the resolved key to both requestContext and the options lookup (Req 4.3, 4.6)', async () => {
    const options = { openai: { reasoningEffort: 'low' } };
    // The resolver returns a sentinel distinct from the request value, so the test
    // proves BOTH sinks receive exactly the resolver's output (single-resolution
    // propagation) — not the raw request value nor two independent resolutions.
    const EFFECTIVE_KEY = 'openai/o3';
    resolveEffectiveModelKey.mockReturnValue(EFFECTIVE_KEY);
    getProviderOptionsForModel.mockReturnValue(options);

    const { req, res } = buildReqRes('openai/o3');
    await invoke(req, res);

    // The route rounds the request's modelKey through resolveEffectiveModelKey
    // exactly once (the single checkpoint), then threads the resolved key everywhere.
    expect(resolveEffectiveModelKey).toHaveBeenCalledTimes(1);
    expect(resolveEffectiveModelKey).toHaveBeenCalledWith('openai/o3');
    expect(getProviderOptionsForModel).toHaveBeenCalledWith(EFFECTIVE_KEY);

    expect(stream).toHaveBeenCalledTimes(1);
    const streamOptions = stream.mock.calls[0][1];
    // requestContext carries the RESOLVED model key for the agent's dynamic model fn.
    expect(streamOptions.requestContext).toBeInstanceOf(RequestContext);
    expect(streamOptions.requestContext.get('modelKey')).toBe(EFFECTIVE_KEY);
    // providerOptions forwarded verbatim from the lookup (effective model's options).
    expect(streamOptions.providerOptions).toBe(options);
  });

  it('rounds an out-of-set modelKey to the effective default and propagates only the resolved default (Req 4.6)', async () => {
    const defaultOptions = { openai: { reasoningEffort: 'high' } };
    // resolveEffectiveModelKey collapses an out-of-available-set key to the default.
    const DEFAULT_KEY = 'openai/gpt-4o';
    resolveEffectiveModelKey.mockReturnValue(DEFAULT_KEY);
    getProviderOptionsForModel.mockReturnValue(defaultOptions);

    const { req, res } = buildReqRes('anthropic/not-allowed');
    await invoke(req, res);

    expect(resolveEffectiveModelKey).toHaveBeenCalledWith(
      'anthropic/not-allowed',
    );
    // The RESOLVED default key (not the raw client value) is what reaches both
    // sinks, so the agent model fn never re-rounds (no second warning).
    expect(getProviderOptionsForModel).toHaveBeenCalledWith(DEFAULT_KEY);

    const streamOptions = stream.mock.calls[0][1];
    expect(streamOptions.requestContext.get('modelKey')).toBe(DEFAULT_KEY);
    expect(streamOptions.providerOptions).toBe(defaultOptions);
  });

  it('rounds an omitted modelKey to the default and threads the resolved default key (Req 4.6)', async () => {
    const defaultOptions = { openai: { reasoningEffort: 'high' } };
    const DEFAULT_KEY = 'openai/gpt-4o';
    resolveEffectiveModelKey.mockReturnValue(DEFAULT_KEY);
    getProviderOptionsForModel.mockReturnValue(defaultOptions);

    const { req, res } = buildReqRes(undefined);
    await invoke(req, res);

    expect(resolveEffectiveModelKey).toHaveBeenCalledWith(undefined);
    expect(getProviderOptionsForModel).toHaveBeenCalledWith(DEFAULT_KEY);

    const streamOptions = stream.mock.calls[0][1];
    expect(streamOptions.requestContext.get('modelKey')).toBe(DEFAULT_KEY);
    expect(streamOptions.providerOptions).toBe(defaultOptions);
  });

  it('keeps the existing error sanitizer wired so provider errors yield a safe message (Req 4.5)', async () => {
    resolveEffectiveModelKey.mockReturnValue('openai/o3');
    getProviderOptionsForModel.mockReturnValue({});

    const { req, res } = buildReqRes('openai/o3');
    await invoke(req, res);

    // createUIMessageStream receives an onError hook; the handler must route it
    // through resolveChatErrorMessage (the existing, unchanged sanitizer).
    const createArgs = createUIMessageStream.mock.calls[0][0];
    const safe = createArgs.onError(new Error('boom: secret leak'));
    expect(resolveChatErrorMessage).toHaveBeenCalledWith(expect.any(Error));
    expect(safe).toBe('SAFE_MESSAGE');
  });
});

describe('post-message handler — vision gate (ai:vision)', () => {
  const buildReqResWithImage = () => {
    const { req, res } = buildReqRes(undefined);
    req.body.messages = [
      {
        id: '1',
        role: 'user',
        parts: [
          { type: 'text', text: 'what is this?' },
          {
            type: 'file',
            mediaType: 'image/png',
            url: 'data:image/png;base64,AAAA',
          },
          { type: 'file', mediaType: 'application/pdf', url: 'data:...' },
        ],
      },
    ];
    return { req, res };
  };

  it('forwards image parts unchanged when vision is on', async () => {
    resolveEffectiveModelKey.mockReturnValue('openai/gpt-4o');
    getProviderOptionsForModel.mockReturnValue({});

    const { req, res } = buildReqResWithImage();
    await invoke(req, res);

    const sentMessages = stream.mock.calls[0][0];
    const partTypes = sentMessages[0].parts.map(
      (p: { type: string }) => p.type,
    );
    expect(partTypes).toEqual(['text', 'file', 'file']);
  });

  it('strips image file-parts (but not other files or text) when vision is off', async () => {
    featureFlags.value = { ...featureFlags.value, vision: false };
    resolveEffectiveModelKey.mockReturnValue('openai/gpt-4o');
    getProviderOptionsForModel.mockReturnValue({});

    const { req, res } = buildReqResWithImage();
    await invoke(req, res);

    const sentMessages = stream.mock.calls[0][0];
    const parts = sentMessages[0].parts as {
      type: string;
      mediaType?: string;
    }[];
    expect(parts.map((p) => p.type)).toEqual(['text', 'file']);
    expect(parts.find((p) => p.type === 'file')?.mediaType).toBe(
      'application/pdf',
    );
  });
});
