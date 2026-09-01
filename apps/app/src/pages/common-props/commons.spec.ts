// --- Mock boundary ---------------------------------------------------------
//
// getServerSideCommonInitialProps builds the SSR props that hydrate global
// atoms on every page; aiEnabled among them gates the sidebar AI affordance.
// The contract under test is the SOURCE of aiEnabled: it must mirror
// crowi.isAiReady() (= enabled && configured), NOT the raw app:aiEnabled toggle.
// We stub crowi.isAiReady() on the request-scoped crowi and assert the prop
// tracks its return value, independent of any config key.
//
// Sourcing via crowi (rather than a direct isAiReady import) is itself part of
// the contract: this builder runs in the Next SSR realm, where a directly
// imported configManager is a separate, never-loaded instance. crowi.isAiReady()
// runs in the Express realm against the loaded config. Asserting the prop comes
// from crowi.isAiReady() guards against regressing to either the raw toggle or a
// direct (realm-unsafe) import.
import type { GetServerSidePropsContext } from 'next';
import { mock, mockDeep } from 'vitest-mock-extended';

import type { CrowiRequest } from '~/interfaces/crowi-request';

import { getServerSideCommonInitialProps } from './commons';

// mockDeep recursively stubs the nested crowi graph the builder walks
// (appService, configManager, attachmentService, customizeService,
// growiInfoService and crowi.isAiReady). Only crowi.isAiReady drives the
// assertion here; the remaining props are irrelevant to this test.
const buildContext = (
  isAiReady: boolean,
  // Optional value for the raw app:aiEnabled toggle. Used to prove the prop
  // sources from isAiReady() and NOT this key (see the discriminating test).
  rawAiEnabledToggle?: boolean,
): GetServerSidePropsContext => {
  const req = mockDeep<CrowiRequest>();
  req.crowi.isAiReady.mockReturnValue(isAiReady);
  if (rawAiEnabledToggle != null) {
    req.crowi.configManager.getConfig.mockImplementation((key) =>
      key === 'app:aiEnabled' ? rawAiEnabledToggle : undefined,
    );
  }
  // The builder narrows context.req to CrowiRequest internally; localize the
  // cast to the single req field rather than the whole context object.
  return mock<GetServerSidePropsContext>({
    req: req as unknown as GetServerSidePropsContext['req'],
  });
};

const getAiEnabledProp = async (
  isAiReady: boolean,
  rawAiEnabledToggle?: boolean,
): Promise<boolean> => {
  const result = await getServerSideCommonInitialProps(
    buildContext(isAiReady, rawAiEnabledToggle),
  );
  if (!('props' in result)) {
    throw new Error('expected a props result');
  }
  const props = await result.props;
  return props.aiEnabled;
};

const getNasStorageEnabledProp = async (
  isNasStorageReady: boolean,
): Promise<boolean> => {
  const req = mockDeep<CrowiRequest>();
  req.crowi.isNasStorageReady.mockReturnValue(isNasStorageReady);
  const context = mock<GetServerSidePropsContext>({
    req: req as unknown as GetServerSidePropsContext['req'],
  });
  const result = await getServerSideCommonInitialProps(context);
  if (!('props' in result)) {
    throw new Error('expected a props result');
  }
  const props = await result.props;
  return props.nasStorageEnabled;
};

describe('getServerSideCommonInitialProps - nasStorageEnabled supply', () => {
  it('supplies nasStorageEnabled=true when the NAS root is ready', async () => {
    expect(await getNasStorageEnabledProp(true)).toBe(true);
  });

  it('supplies nasStorageEnabled=false when the NAS root is not ready', async () => {
    expect(await getNasStorageEnabledProp(false)).toBe(false);
  });
});

const getMessagesModeProp = async (
  rawMessagesMode: string | undefined,
): Promise<string> => {
  const req = mockDeep<CrowiRequest>();
  req.crowi.configManager.getConfig.mockImplementation((key) =>
    key === 'app:messagesMode' ? rawMessagesMode : undefined,
  );
  const context = mock<GetServerSidePropsContext>({
    req: req as unknown as GetServerSidePropsContext['req'],
  });
  const result = await getServerSideCommonInitialProps(context);
  if (!('props' in result)) {
    throw new Error('expected a props result');
  }
  const props = await result.props;
  return props.messagesMode;
};

describe('getServerSideCommonInitialProps - messagesMode supply', () => {
  it('passes a valid app:messagesMode value through', async () => {
    expect(await getMessagesModeProp('direct')).toBe('direct');
  });

  it('normalizes an unset / invalid value to "off"', async () => {
    expect(await getMessagesModeProp(undefined)).toBe('off');
    expect(await getMessagesModeProp('bogus')).toBe('off');
  });
});

const getMessagesImageUploadEnabledProp = async (
  raw: boolean | undefined,
): Promise<boolean> => {
  const req = mockDeep<CrowiRequest>();
  req.crowi.configManager.getConfig.mockImplementation((key) =>
    key === 'app:messagesImageUploadEnabled' ? raw : undefined,
  );
  const context = mock<GetServerSidePropsContext>({
    req: req as unknown as GetServerSidePropsContext['req'],
  });
  const result = await getServerSideCommonInitialProps(context);
  if (!('props' in result)) {
    throw new Error('expected a props result');
  }
  const props = await result.props;
  return props.messagesImageUploadEnabled;
};

describe('getServerSideCommonInitialProps - messagesImageUploadEnabled supply', () => {
  it('mirrors the app:messagesImageUploadEnabled config value', async () => {
    expect(await getMessagesImageUploadEnabledProp(true)).toBe(true);
    expect(await getMessagesImageUploadEnabledProp(false)).toBe(false);
  });
});

const getAiVisionEnabledProp = async (
  raw: boolean | undefined,
): Promise<boolean> => {
  const req = mockDeep<CrowiRequest>();
  req.crowi.configManager.getConfig.mockImplementation((key) =>
    key === 'ai:vision' ? raw : undefined,
  );
  const context = mock<GetServerSidePropsContext>({
    req: req as unknown as GetServerSidePropsContext['req'],
  });
  const result = await getServerSideCommonInitialProps(context);
  if (!('props' in result)) {
    throw new Error('expected a props result');
  }
  const props = await result.props;
  return props.aiVisionEnabled;
};

describe('getServerSideCommonInitialProps - aiVisionEnabled supply', () => {
  it('mirrors the ai:vision config value', async () => {
    expect(await getAiVisionEnabledProp(true)).toBe(true);
    expect(await getAiVisionEnabledProp(false)).toBe(false);
  });
});

describe('getServerSideCommonInitialProps - PWA / push supply', () => {
  it('mirrors app:pwaEnabled', async () => {
    const req = mockDeep<CrowiRequest>();
    req.crowi.configManager.getConfig.mockImplementation((k) =>
      k === 'app:pwaEnabled' ? true : undefined,
    );
    const context = mock<GetServerSidePropsContext>({
      req: req as unknown as GetServerSidePropsContext['req'],
    });
    const result = await getServerSideCommonInitialProps(context);
    if (!('props' in result)) throw new Error('expected a props result');
    expect((await result.props).pwaEnabled).toBe(true);
  });

  it('mirrors app:pushNotificationEnabled', async () => {
    const req = mockDeep<CrowiRequest>();
    req.crowi.configManager.getConfig.mockImplementation((k) =>
      k === 'app:pushNotificationEnabled' ? true : undefined,
    );
    const context = mock<GetServerSidePropsContext>({
      req: req as unknown as GetServerSidePropsContext['req'],
    });
    const result = await getServerSideCommonInitialProps(context);
    if (!('props' in result)) throw new Error('expected a props result');
    expect((await result.props).pushNotificationEnabled).toBe(true);
  });
});

describe('getServerSideCommonInitialProps - aiEnabled supply', () => {
  it('supplies aiEnabled=true when AI is ready (enabled && configured)', async () => {
    expect(await getAiEnabledProp(true)).toBe(true);
  });

  it('supplies aiEnabled=false when AI is not ready (e.g. enabled but unconfigured)', async () => {
    expect(await getAiEnabledProp(false)).toBe(false);
  });

  it('mirrors isAiReady(), not the raw app:aiEnabled toggle (toggle on but not ready)', async () => {
    // The raw app:aiEnabled key is true, but isAiReady() (= enabled && configured)
    // is false. The prop must follow isAiReady(), proving it never reads the toggle.
    expect(await getAiEnabledProp(false, true)).toBe(false);
  });
});
