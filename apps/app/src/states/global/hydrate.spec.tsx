import { render, screen } from '@testing-library/react';
import { Provider, useAtomValue } from 'jotai';
import { describe, expect, it } from 'vitest';

import type { CommonInitialProps } from '~/pages/common-props';
import { nasStorageEnabledAtom } from '~/states/server-configurations';

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
