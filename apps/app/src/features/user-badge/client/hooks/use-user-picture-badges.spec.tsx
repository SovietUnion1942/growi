// @vitest-environment happy-dom

import type { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';

import {
  type UserPictureBadgeSource,
  useUserPictureBadges,
} from './use-user-picture-badges';

const apiv3Get = vi.fn();
vi.mock('~/client/util/apiv3-client', () => ({
  apiv3Get: (...args: unknown[]) => apiv3Get(...args),
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'badge.description_loading' ? '...' : key),
  }),
}));

const wrapper = ({ children }: PropsWithChildren): JSX.Element => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);

const badgeSummary: UserPictureBadgeSource[] = [
  {
    badgeType: 'badge-type-1',
    iconKey: 'star',
    name: 'Top Contributor',
    level: 3,
  },
];

beforeEach(() => {
  apiv3Get.mockReset();
});

describe('useUserPictureBadges', () => {
  it('returns an empty array when badgeSummary is undefined', () => {
    apiv3Get.mockResolvedValue({ data: { badgeTypes: [] } });

    const { result } = renderHook(() => useUserPictureBadges(undefined), {
      wrapper,
    });

    expect(result.current).toEqual([]);
  });

  it('returns an empty array when badgeSummary is an empty array', () => {
    apiv3Get.mockResolvedValue({ data: { badgeTypes: [] } });

    const { result } = renderHook(() => useUserPictureBadges([]), {
      wrapper,
    });

    expect(result.current).toEqual([]);
  });

  it('enriches each badge with the description resolved by badgeType id from the catalog', async () => {
    apiv3Get.mockResolvedValue({
      data: {
        badgeTypes: [
          { _id: 'badge-type-1', description: 'Awarded for great edits' },
        ],
      },
    });

    const { result } = renderHook(() => useUserPictureBadges(badgeSummary), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current).toEqual([
        {
          iconKey: 'star',
          name: 'Top Contributor',
          level: 3,
          description: 'Awarded for great edits',
        },
      ]);
    });
  });

  it('does not attach a description when no catalog entry matches the badgeType id', async () => {
    apiv3Get.mockResolvedValue({
      data: {
        badgeTypes: [
          { _id: 'some-other-badge-type', description: 'Unrelated' },
        ],
      },
    });

    const { result } = renderHook(() => useUserPictureBadges(badgeSummary), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current).toEqual([
        { iconKey: 'star', name: 'Top Contributor', level: 3 },
      ]);
    });
  });

  it('uses a translated placeholder description while the catalog is still loading', () => {
    // Never resolves within this test, so the hook observes isLoading: true.
    apiv3Get.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useUserPictureBadges(badgeSummary), {
      wrapper,
    });

    expect(result.current).toEqual([
      {
        iconKey: 'star',
        name: 'Top Contributor',
        level: 3,
        description: '...',
      },
    ]);
  });
});
