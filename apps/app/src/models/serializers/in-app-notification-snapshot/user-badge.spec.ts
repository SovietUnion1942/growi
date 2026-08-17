import { Types } from 'mongoose';

// Mock mongoose so we can control BadgeType.findById without a real DB connection
vi.mock('mongoose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mongoose')>();
  return {
    ...actual,
    default: {
      ...actual.default,
      model: vi.fn(),
    },
  };
});

// Import AFTER mocks are registered
import mongoose from 'mongoose';

import type { IUserBadge } from '~/features/user-badge/interfaces/badge';

import { parseSnapshot, stringifySnapshot } from './user-badge';

const mockMongooseModel = vi.mocked(mongoose.model);

describe('user-badge snapshot serializer', () => {
  const badgeTypeId = new Types.ObjectId();
  const userId = new Types.ObjectId();

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('stringifySnapshot', () => {
    it('resolves the level-specific name for an automatic (leveled) grant', async () => {
      const findById = vi.fn().mockResolvedValue({
        _id: badgeTypeId,
        name: 'Editor',
        levels: [
          { level: 1, name: 'Bronze Editor', iconKey: 'bronze', threshold: 5 },
          { level: 2, name: 'Silver Editor', iconKey: 'silver', threshold: 20 },
        ],
      });
      mockMongooseModel.mockReturnValue({ findById } as never);

      const userBadge: IUserBadge = {
        user: userId,
        badgeType: badgeTypeId,
        level: 2,
        grantedAt: new Date(),
        grantedBy: null,
        note: null,
        revokedAt: null,
        revokedBy: null,
      };

      const snapshot = await stringifySnapshot(userBadge);

      expect(findById).toHaveBeenCalledWith(badgeTypeId);
      expect(snapshot).toBeDefined();
      expect(parseSnapshot(snapshot as string)).toEqual({
        badgeName: 'Silver Editor',
        level: 2,
      });
    });

    it('resolves the top-level BadgeType name for a manual (level: null) grant', async () => {
      const findById = vi.fn().mockResolvedValue({
        _id: badgeTypeId,
        name: 'Community Helper',
        levels: [],
      });
      mockMongooseModel.mockReturnValue({ findById } as never);

      const userBadge: IUserBadge = {
        user: userId,
        badgeType: badgeTypeId,
        level: null,
        grantedAt: new Date(),
        grantedBy: userId,
        note: 'Great support work',
        revokedAt: null,
        revokedBy: null,
      };

      const snapshot = await stringifySnapshot(userBadge);

      expect(parseSnapshot(snapshot as string)).toEqual({
        badgeName: 'Community Helper',
        level: null,
      });
    });

    it('falls back to the BadgeType name when the specific level is not found', async () => {
      const findById = vi.fn().mockResolvedValue({
        _id: badgeTypeId,
        name: 'Editor',
        levels: [],
      });
      mockMongooseModel.mockReturnValue({ findById } as never);

      const userBadge: IUserBadge = {
        user: userId,
        badgeType: badgeTypeId,
        level: 3,
        grantedAt: new Date(),
        grantedBy: null,
        note: null,
        revokedAt: null,
        revokedBy: null,
      };

      const snapshot = await stringifySnapshot(userBadge);

      expect(parseSnapshot(snapshot as string)).toEqual({
        badgeName: 'Editor',
        level: 3,
      });
    });

    it('returns undefined when the referenced BadgeType no longer exists', async () => {
      const findById = vi.fn().mockResolvedValue(null);
      mockMongooseModel.mockReturnValue({ findById } as never);

      const userBadge: IUserBadge = {
        user: userId,
        badgeType: badgeTypeId,
        level: 1,
        grantedAt: new Date(),
        grantedBy: null,
        note: null,
        revokedAt: null,
        revokedBy: null,
      };

      const snapshot = await stringifySnapshot(userBadge);

      expect(snapshot).toBeUndefined();
    });
  });
});
