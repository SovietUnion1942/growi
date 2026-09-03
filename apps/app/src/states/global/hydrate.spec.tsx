import { render, screen } from '@testing-library/react';
import { Provider, useAtomValue } from 'jotai';
import { describe, expect, it } from 'vitest';

import type { CommonInitialProps } from '~/pages/common-props';
import {
  aiVisionEnabledAtom,
  messagesImageUploadEnabledAtom,
  messagesModeAtom,
  nasStorageEnabledAtom,
  pushNotificationEnabledAtom,
  pwaEnabledAtom,
  userBadgeEnabledAtom,
  wikiGapSuggestionsEnabledAtom,
} from '~/states/server-configurations';

import { useHydrateGlobalInitialAtoms } from './hydrate';

const baseProps: CommonInitialProps = {
  appTitle: 'GROWI',
  siteUrl: undefined,
  siteUrlWithEmptyValueWarn: '',
  confidential: '',
  growiVersion: '0.0.0',
  isDefaultLogo: true,
  customTitleTemplate: '',
  growiCloudUri: undefined,
  growiAppIdForGrowiCloud: undefined,
  forcedColorScheme: undefined,
  aiEnabled: false,
  nasStorageEnabled: false,
  messagesMode: 'off',
  modernUiMode: 'off',
  uiTier: 'legacy',
  uaBelowMin: false,
  uaOs: 'other',
  sysreqNotice: false,
  messagesImageUploadEnabled: true,
  aiVisionEnabled: false,
  pwaEnabled: false,
  pushNotificationEnabled: false,
  userBadgeEnabled: false,
  wikiGapSuggestionsEnabled: false,
  boardEnabled: false,
};

const NasStorageEnabledProbe = ({
  commonInitialProps,
}: {
  commonInitialProps: CommonInitialProps;
}) => {
  useHydrateGlobalInitialAtoms(commonInitialProps);
  const value = useAtomValue(nasStorageEnabledAtom);
  return <span data-testid="value">{String(value)}</span>;
};

describe('useHydrateGlobalInitialAtoms - nasStorageEnabledAtom', () => {
  it('hydrates the atom to true when the server prop says enabled', () => {
    render(
      <Provider>
        <NasStorageEnabledProbe
          commonInitialProps={{ ...baseProps, nasStorageEnabled: true }}
        />
      </Provider>,
    );
    expect(screen.getByTestId('value')).toHaveTextContent('true');
  });

  it('hydrates the atom to false when the server prop says disabled', () => {
    render(
      <Provider>
        <NasStorageEnabledProbe
          commonInitialProps={{ ...baseProps, nasStorageEnabled: false }}
        />
      </Provider>,
    );
    expect(screen.getByTestId('value')).toHaveTextContent('false');
  });
});

const MessagesModeProbe = ({
  commonInitialProps,
}: {
  commonInitialProps: CommonInitialProps;
}) => {
  useHydrateGlobalInitialAtoms(commonInitialProps);
  const value = useAtomValue(messagesModeAtom);
  return <span data-testid="value">{value}</span>;
};

describe('useHydrateGlobalInitialAtoms - messagesModeAtom', () => {
  it('hydrates the atom from the server prop', () => {
    render(
      <Provider>
        <MessagesModeProbe
          commonInitialProps={{ ...baseProps, messagesMode: 'full' }}
        />
      </Provider>,
    );
    expect(screen.getByTestId('value')).toHaveTextContent('full');
  });
});

const ImageUploadEnabledProbe = ({
  commonInitialProps,
}: {
  commonInitialProps: CommonInitialProps;
}) => {
  useHydrateGlobalInitialAtoms(commonInitialProps);
  const value = useAtomValue(messagesImageUploadEnabledAtom);
  return <span data-testid="value">{String(value)}</span>;
};

describe('useHydrateGlobalInitialAtoms - messagesImageUploadEnabledAtom', () => {
  it('hydrates the atom to false when the server prop disables uploads', () => {
    render(
      <Provider>
        <ImageUploadEnabledProbe
          commonInitialProps={{
            ...baseProps,
            messagesImageUploadEnabled: false,
          }}
        />
      </Provider>,
    );
    expect(screen.getByTestId('value')).toHaveTextContent('false');
  });
});

const AiVisionEnabledProbe = ({
  commonInitialProps,
}: {
  commonInitialProps: CommonInitialProps;
}) => {
  useHydrateGlobalInitialAtoms(commonInitialProps);
  const value = useAtomValue(aiVisionEnabledAtom);
  return <span data-testid="value">{String(value)}</span>;
};

describe('useHydrateGlobalInitialAtoms - aiVisionEnabledAtom', () => {
  it('hydrates the atom to true when the server prop enables vision', () => {
    render(
      <Provider>
        <AiVisionEnabledProbe
          commonInitialProps={{ ...baseProps, aiVisionEnabled: true }}
        />
      </Provider>,
    );
    expect(screen.getByTestId('value')).toHaveTextContent('true');
  });
});

const PwaPushProbe = ({
  commonInitialProps,
}: {
  commonInitialProps: CommonInitialProps;
}) => {
  useHydrateGlobalInitialAtoms(commonInitialProps);
  return (
    <span data-testid="value">
      {String(useAtomValue(pwaEnabledAtom))}/
      {String(useAtomValue(pushNotificationEnabledAtom))}
    </span>
  );
};

describe('useHydrateGlobalInitialAtoms - pwa / push atoms', () => {
  it('hydrates both from the server props', () => {
    render(
      <Provider>
        <PwaPushProbe
          commonInitialProps={{
            ...baseProps,
            pwaEnabled: true,
            pushNotificationEnabled: true,
          }}
        />
      </Provider>,
    );
    expect(screen.getByTestId('value')).toHaveTextContent('true/true');
  });
});

const UserBadgeProbe = ({
  commonInitialProps,
}: {
  commonInitialProps: CommonInitialProps;
}) => {
  useHydrateGlobalInitialAtoms(commonInitialProps);
  return (
    <span data-testid="value">
      {String(useAtomValue(userBadgeEnabledAtom))}
    </span>
  );
};

describe('useHydrateGlobalInitialAtoms - userBadgeEnabledAtom', () => {
  it('hydrates from the server prop', () => {
    render(
      <Provider>
        <UserBadgeProbe
          commonInitialProps={{ ...baseProps, userBadgeEnabled: true }}
        />
      </Provider>,
    );
    expect(screen.getByTestId('value')).toHaveTextContent('true');
  });
});

const WikiGapProbe = ({
  commonInitialProps,
}: {
  commonInitialProps: CommonInitialProps;
}) => {
  useHydrateGlobalInitialAtoms(commonInitialProps);
  return (
    <span data-testid="value">
      {String(useAtomValue(wikiGapSuggestionsEnabledAtom))}
    </span>
  );
};

describe('useHydrateGlobalInitialAtoms - wikiGapSuggestionsEnabledAtom', () => {
  it('hydrates from the server prop', () => {
    render(
      <Provider>
        <WikiGapProbe
          commonInitialProps={{
            ...baseProps,
            wikiGapSuggestionsEnabled: true,
          }}
        />
      </Provider>,
    );
    expect(screen.getByTestId('value')).toHaveTextContent('true');
  });
});
