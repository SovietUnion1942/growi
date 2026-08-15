import { Types } from 'mongoose';

import BadgeType from './badge-type-model';

const createdBy = new Types.ObjectId();

describe('BadgeType model validation', () => {
  describe('category: automatic', () => {
    it('fails validation when levels is empty', async () => {
      const doc = new BadgeType({
        name: 'Editor',
        description: 'Awarded for editing pages',
        iconKey: 'edit',
        category: 'automatic',
        levels: [],
        createdBy,
      });

      await expect(doc.validate()).rejects.toThrow();
    });

    it('fails validation when a level is missing a threshold', async () => {
      const doc = new BadgeType({
        name: 'Editor',
        description: 'Awarded for editing pages',
        iconKey: 'edit',
        category: 'automatic',
        levels: [{ level: 1, name: 'Bronze', iconKey: 'edit' }],
        createdBy,
      });

      await expect(doc.validate()).rejects.toThrow();
    });

    it('fails validation when levels are not in ascending order', async () => {
      const doc = new BadgeType({
        name: 'Editor',
        description: 'Awarded for editing pages',
        iconKey: 'edit',
        category: 'automatic',
        levels: [
          {
            level: 2,
            name: 'Silver',
            iconKey: 'edit',
            threshold: 20,
          },
          {
            level: 1,
            name: 'Bronze',
            iconKey: 'edit',
            threshold: 5,
          },
        ],
        createdBy,
      });

      await expect(doc.validate()).rejects.toThrow();
    });

    it('fails validation when levels contain duplicate level numbers', async () => {
      const doc = new BadgeType({
        name: 'Editor',
        description: 'Awarded for editing pages',
        iconKey: 'edit',
        category: 'automatic',
        levels: [
          {
            level: 1,
            name: 'Bronze',
            iconKey: 'edit',
            threshold: 5,
          },
          {
            level: 1,
            name: 'Bronze duplicate',
            iconKey: 'edit',
            threshold: 10,
          },
        ],
        createdBy,
      });

      await expect(doc.validate()).rejects.toThrow();
    });

    it('passes validation with one or more ascending, unique levels each with a threshold', async () => {
      const doc = new BadgeType({
        name: 'Editor',
        description: 'Awarded for editing pages',
        iconKey: 'edit',
        category: 'automatic',
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
        createdBy,
      });

      await expect(doc.validate()).resolves.toBeUndefined();
    });
  });

  describe('category: manual', () => {
    it('fails validation when levels is non-empty', async () => {
      const doc = new BadgeType({
        name: 'Community Helper',
        description: 'Awarded manually by admins',
        iconKey: 'star',
        category: 'manual',
        levels: [
          {
            level: 1,
            name: 'Bronze',
            iconKey: 'star',
            threshold: 5,
          },
        ],
        createdBy,
      });

      await expect(doc.validate()).rejects.toThrow();
    });

    it('passes validation with an empty levels array', async () => {
      const doc = new BadgeType({
        name: 'Community Helper',
        description: 'Awarded manually by admins',
        iconKey: 'star',
        category: 'manual',
        levels: [],
        createdBy,
      });

      await expect(doc.validate()).resolves.toBeUndefined();
    });
  });

  describe('soft delete fields', () => {
    it('defaults isDeleted to false and deletedAt to null', () => {
      const doc = new BadgeType({
        name: 'Community Helper',
        description: 'Awarded manually by admins',
        iconKey: 'star',
        category: 'manual',
        levels: [],
        createdBy,
      });

      expect(doc.isDeleted).toBe(false);
      expect(doc.deletedAt).toBeNull();
    });
  });
});
