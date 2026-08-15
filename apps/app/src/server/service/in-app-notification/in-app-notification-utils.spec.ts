import { Types } from 'mongoose';

vi.mock('~/models/serializers/in-app-notification-snapshot/user-badge', () => ({
  stringifySnapshot: vi.fn(),
}));

import type { IUserBadge } from '~/features/user-badge/interfaces/badge';
import { SupportedTargetModel } from '~/interfaces/activity';
import * as userBadgeSerializers from '~/models/serializers/in-app-notification-snapshot/user-badge';

import { generateSnapshot } from './in-app-notification-utils';

describe('generateSnapshot', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('delegates to the user-badge serializer for a UserBadge target, so the resulting notification snapshot carries the granted badge name', async () => {
    const userBadge: IUserBadge = {
      user: new Types.ObjectId(),
      badgeType: new Types.ObjectId(),
      level: 1,
      grantedAt: new Date(),
      grantedBy: null,
      note: null,
    };
    const expectedSnapshot = JSON.stringify({
      badgeName: 'Bronze Editor',
      level: 1,
    });
    vi.mocked(userBadgeSerializers.stringifySnapshot).mockResolvedValue(
      expectedSnapshot,
    );

    const result = await generateSnapshot(
      SupportedTargetModel.MODEL_USER_BADGE,
      userBadge,
    );

    expect(userBadgeSerializers.stringifySnapshot).toHaveBeenCalledWith(
      userBadge,
    );
    expect(result).toBe(expectedSnapshot);
    expect(JSON.parse(result as string).badgeName).toBe('Bronze Editor');
  });

  it('returns undefined for an unrecognized targetModel', async () => {
    const result = await generateSnapshot('SomethingUnsupported', {
      user: new Types.ObjectId(),
      badgeType: new Types.ObjectId(),
      level: null,
      grantedAt: new Date(),
      grantedBy: null,
      note: null,
    });

    expect(result).toBeUndefined();
  });
});
