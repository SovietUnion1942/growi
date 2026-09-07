import type { GetServerSidePropsContext } from 'next';
import { mock, mockDeep } from 'vitest-mock-extended';

import type { CrowiRequest } from '~/interfaces/crowi-request';

import { resolveTaskPageGate } from './task-page-gate';

const buildContext = (taskEnabled: boolean): GetServerSidePropsContext => {
  const req = mockDeep<CrowiRequest>();
  req.crowi.configManager.getConfig.mockImplementation((key: string) =>
    key === 'app:taskEnabled' ? taskEnabled : undefined,
  );
  return mock<GetServerSidePropsContext>({
    req: req as unknown as GetServerSidePropsContext['req'],
  });
};

describe('resolveTaskPageGate', () => {
  it('returns notFound when the task feature is disabled', () => {
    expect(resolveTaskPageGate(buildContext(false))).toEqual({
      notFound: true,
    });
  });

  it('returns an empty props result when the task feature is enabled', () => {
    expect(resolveTaskPageGate(buildContext(true))).toEqual({ props: {} });
  });
});
