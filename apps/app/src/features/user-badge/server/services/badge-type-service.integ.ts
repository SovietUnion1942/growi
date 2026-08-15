/**
 * Integration tests — BadgeTypeService.createBadgeType / updateBadgeType.
 *
 * Uses a real MongoDB connection (wired by vitest.workspace.mts integ
 * setup) because both functions perform actual reads/writes and rely on
 * the BadgeType model's `pre('validate')` hook running through
 * `.create()`/`.save()`.
 *
 * Requirements: 1.1 (required fields on create), 1.2/1.3 (category-shape
 * validation, service layer), 1.4 (edit reflects on future evaluation/
 * display without altering existing UserBadge grant records).
 * Design: BadgeTypeService — Service Interface, Responsibilities &
 * Constraints, Implementation Notes (service-layer validation is a second
 * defense line in front of the Mongoose `pre('validate')` hook).
 */

import type { IUserHasId } from '@growi/core';
import { Types } from 'mongoose';
import { mock } from 'vitest-mock-extended';

import type { IBadgeType } from '../../interfaces/badge';
import BadgeType from '../models/badge-type-model';
import UserBadge from '../models/user-badge-model';
import {
  BadgeTypeNotFoundError,
  BadgeTypeValidationError,
} from './badge-type-errors';
import {
  createBadgeType,
  deleteBadgeType,
  listBadgeTypes,
  updateBadgeType,
} from './badge-type-service';

const createdBy = mock<IUserHasId>({ _id: new Types.ObjectId().toString() });

const automaticInput = {
  name: 'Editor',
  description: 'Awarded for editing pages',
  iconKey: 'edit',
  category: 'automatic' as const,
  levels: [
    {
      level: 1,
      name: 'Bronze',
      iconKey: 'edit',
      threshold: 5,
    },
    {
      level: 2,
      name: 'Silver',
      iconKey: 'edit',
      threshold: 20,
    },
  ],
};

const manualInput = {
  name: 'Community Helper',
  description: 'Awarded manually by admins',
  iconKey: 'star',
  category: 'manual' as const,
  levels: [] as IBadgeType['levels'],
};

describe('BadgeTypeService', () => {
  afterEach(async () => {
    await BadgeType.deleteMany({});
    await UserBadge.deleteMany({});
  });

  describe('createBadgeType', () => {
    it('creates an automatic BadgeType with valid levels', async () => {
      const created = await createBadgeType(automaticInput, createdBy);

      expect(created._id).toBeDefined();
      expect(created.name).toBe('Editor');
      expect(created.category).toBe('automatic');
      expect(created.levels).toHaveLength(2);
      expect(created.isDeleted).toBe(false);
    });

    it('creates a manual BadgeType with an empty levels array', async () => {
      const created = await createBadgeType(manualInput, createdBy);

      expect(created._id).toBeDefined();
      expect(created.category).toBe('manual');
      expect(created.levels).toEqual([]);
    });

    it('rejects an automatic BadgeType with no levels before writing to the DB', async () => {
      await expect(
        createBadgeType({ ...automaticInput, levels: [] }, createdBy),
      ).rejects.toThrow(BadgeTypeValidationError);

      const count = await BadgeType.countDocuments({});
      expect(count).toBe(0);
    });

    it('rejects a manual BadgeType with non-empty levels before writing to the DB', async () => {
      await expect(
        createBadgeType(
          { ...manualInput, levels: automaticInput.levels },
          createdBy,
        ),
      ).rejects.toThrow(BadgeTypeValidationError);

      const count = await BadgeType.countDocuments({});
      expect(count).toBe(0);
    });
  });

  describe('updateBadgeType', () => {
    it('updates name/description/levels and persists the change', async () => {
      const created = await createBadgeType(automaticInput, createdBy);

      const updated = await updateBadgeType(created._id.toString(), {
        name: 'Editor Pro',
        levels: [
          {
            level: 1,
            name: 'Bronze',
            iconKey: 'edit',
            threshold: 5,
          },
          {
            level: 2,
            name: 'Silver',
            iconKey: 'edit',
            threshold: 15,
          },
          {
            level: 3,
            name: 'Gold',
            iconKey: 'edit',
            threshold: 50,
          },
        ],
      });

      expect(updated.name).toBe('Editor Pro');
      expect(updated.levels).toHaveLength(3);

      const persisted = await BadgeType.findById(created._id);
      expect(persisted?.name).toBe('Editor Pro');
      expect(persisted?.levels).toHaveLength(3);
    });

    it('rejects an attempt to change category, without persisting anything', async () => {
      const created = await createBadgeType(automaticInput, createdBy);

      await expect(
        updateBadgeType(created._id.toString(), {
          // Runtime callers (HTTP JSON bodies) are not type-checked, so
          // simulate one that tries to smuggle `category` through anyway.
          ...({ category: 'manual' } as Record<string, unknown>),
        }),
      ).rejects.toThrow(BadgeTypeValidationError);

      const persisted = await BadgeType.findById(created._id);
      expect(persisted?.category).toBe('automatic');
    });

    it('rejects clearing levels down to zero on an automatic BadgeType', async () => {
      const created = await createBadgeType(automaticInput, createdBy);

      await expect(
        updateBadgeType(created._id.toString(), { levels: [] }),
      ).rejects.toThrow(BadgeTypeValidationError);

      const persisted = await BadgeType.findById(created._id);
      expect(persisted?.levels).toHaveLength(2);
    });

    it('rejects updates for a BadgeType id that does not exist', async () => {
      const missingId = new Types.ObjectId().toString();

      await expect(
        updateBadgeType(missingId, { name: 'Nope' }),
      ).rejects.toThrow(BadgeTypeNotFoundError);
    });

    it('does not alter an existing UserBadge grant record when the BadgeType is edited, and reference resolution reflects the new BadgeType data', async () => {
      const created = await createBadgeType(automaticInput, createdBy);

      const grantedAt = new Date();
      const userId = new Types.ObjectId();
      const grant = await UserBadge.create({
        user: userId,
        badgeType: created._id,
        level: 1,
        grantedAt,
        grantedBy: null,
        note: null,
      });

      await updateBadgeType(created._id.toString(), { name: 'Editor Pro' });

      // The grant record itself is untouched: same level, same grantedAt,
      // same badgeType reference — because UserBadge stores only an
      // ObjectId reference, not a denormalized copy of BadgeType fields.
      const persistedGrant = await UserBadge.findById(grant._id);
      expect(persistedGrant?.level).toBe(1);
      expect(persistedGrant?.grantedAt.getTime()).toBe(grantedAt.getTime());
      expect(persistedGrant?.badgeType.toString()).toBe(created._id.toString());

      // Resolving the reference now shows the *current* BadgeType data,
      // proving historical grants surface up-to-date type info by design.
      const resolvedBadgeType = await BadgeType.findById(
        persistedGrant?.badgeType,
      );
      expect(resolvedBadgeType?.name).toBe('Editor Pro');
    });
  });

  describe('deleteBadgeType', () => {
    it('soft-deletes: sets isDeleted/deletedAt, and the document remains fetchable by id', async () => {
      const created = await createBadgeType(automaticInput, createdBy);

      await deleteBadgeType(created._id.toString());

      const persisted = await BadgeType.findById(created._id);
      expect(persisted).not.toBeNull();
      expect(persisted?.isDeleted).toBe(true);
      expect(persisted?.deletedAt).not.toBeNull();
    });

    it('is idempotent when called again on an already soft-deleted BadgeType', async () => {
      const created = await createBadgeType(automaticInput, createdBy);
      await deleteBadgeType(created._id.toString());
      const firstDeletedAt = (await BadgeType.findById(created._id))?.deletedAt;

      await expect(
        deleteBadgeType(created._id.toString()),
      ).resolves.toBeUndefined();

      const persisted = await BadgeType.findById(created._id);
      expect(persisted?.isDeleted).toBe(true);
      // A no-op second call must not clobber the original deletion timestamp.
      expect(persisted?.deletedAt?.getTime()).toBe(firstDeletedAt?.getTime());
    });

    it('rejects deleting a BadgeType id that does not exist', async () => {
      const missingId = new Types.ObjectId().toString();

      await expect(deleteBadgeType(missingId)).rejects.toThrow(
        BadgeTypeNotFoundError,
      );
    });

    it('leaves an existing UserBadge grant record resolvable and unaffected (requirement 1.5: already-granted badges keep displaying after deletion)', async () => {
      const created = await createBadgeType(automaticInput, createdBy);
      const grantedAt = new Date();
      const userId = new Types.ObjectId();
      const grant = await UserBadge.create({
        user: userId,
        badgeType: created._id,
        level: 1,
        grantedAt,
        grantedBy: null,
        note: null,
      });

      await deleteBadgeType(created._id.toString());

      const persistedGrant = await UserBadge.findById(grant._id);
      expect(persistedGrant?.level).toBe(1);
      expect(persistedGrant?.badgeType.toString()).toBe(created._id.toString());

      const resolvedBadgeType = await BadgeType.findById(
        persistedGrant?.badgeType,
      );
      expect(resolvedBadgeType).not.toBeNull();
      expect(resolvedBadgeType?.name).toBe(automaticInput.name);
      expect(resolvedBadgeType?.isDeleted).toBe(true);
    });
  });

  describe('listBadgeTypes', () => {
    it('excludes soft-deleted BadgeTypes when includeDeleted is false', async () => {
      const kept = await createBadgeType(automaticInput, createdBy);
      const deleted = await createBadgeType(manualInput, createdBy);
      await deleteBadgeType(deleted._id.toString());

      const result = await listBadgeTypes(false);

      expect(result.map((b) => b._id.toString())).toEqual([
        kept._id.toString(),
      ]);
    });

    it('includes soft-deleted BadgeTypes when includeDeleted is true', async () => {
      const kept = await createBadgeType(automaticInput, createdBy);
      const deleted = await createBadgeType(manualInput, createdBy);
      await deleteBadgeType(deleted._id.toString());

      const result = await listBadgeTypes(true);

      expect(result.map((b) => b._id.toString()).sort()).toEqual(
        [kept._id.toString(), deleted._id.toString()].sort(),
      );
    });
  });
});
