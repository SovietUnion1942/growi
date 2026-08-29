import type { GetServerSidePropsContext } from 'next';
import { mock, mockDeep } from 'vitest-mock-extended';

import type { CrowiRequest } from '~/interfaces/crowi-request';

import { resolveNasStoragePageGate } from './nas-page-gate';

const buildContext = (
  isNasStorageReady: boolean,
): GetServerSidePropsContext => {
  const req = mockDeep<CrowiRequest>();
  req.crowi.isNasStorageReady.mockReturnValue(isNasStorageReady);
  return mock<GetServerSidePropsContext>({
    req: req as unknown as GetServerSidePropsContext['req'],
  });
};

describe('resolveNasStoragePageGate', () => {
  it('returns notFound when the NAS storage feature is not ready', () => {
    expect(resolveNasStoragePageGate(buildContext(false))).toEqual({
      notFound: true,
    });
  });

  it('returns an empty props result when the NAS storage feature is ready', () => {
    expect(resolveNasStoragePageGate(buildContext(true))).toEqual({
      props: {},
    });
  });
});
