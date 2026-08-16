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

    it('fails validation when a threshold is 0 (below the min:1 boundary)', async () => {
      const doc = new BadgeType({
        name: 'Editor',
        description: 'Awarded for editing pages',
        iconKey: 'edit',
        category: 'automatic',
        levels: [{ level: 1, name: 'Bronze', iconKey: 'edit', threshold: 0 }],
        createdBy,
      });

      await expect(doc.validate()).rejects.toThrow();
    });

    it('fails validation when a level number is 0 (below the min:1 boundary)', async () => {
      const doc = new BadgeType({
        name: 'Editor',
        description: 'Awarded for editing pages',
        iconKey: 'edit',
        category: 'automatic',
        levels: [{ level: 0, name: 'Bronze', iconKey: 'edit', threshold: 5 }],
        createdBy,
      });

      await expect(doc.validate()).rejects.toThrow();
    });

    it('passes validation with the minimum boundary values (level: 1, threshold: 1)', async () => {
      const doc = new BadgeType({
        name: 'Editor',
        description: 'Awarded for editing pages',
        iconKey: 'edit',
        category: 'automatic',
        levels: [{ level: 1, name: 'Bronze', iconKey: 'edit', threshold: 1 }],
        createdBy,
      });

      await expect(doc.validate()).resolves.toBeUndefined();
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

  describe('iconType / iconAttachment', () => {
    it('defaults iconType to materialSymbol and iconAttachment to null', () => {
      const doc = new BadgeType({
        name: 'Community Helper',
        description: 'Awarded manually by admins',
        iconKey: 'star',
        category: 'manual',
        levels: [],
        createdBy,
      });

      expect(doc.iconType).toBe('materialSymbol');
      expect(doc.iconAttachment).toBeNull();
    });

    it('fails validation when iconType is image but iconAttachment is not set', async () => {
      const doc = new BadgeType({
        name: 'Community Helper',
        description: 'Awarded manually by admins',
        iconKey: 'star',
        category: 'manual',
        levels: [],
        iconType: 'image',
        createdBy,
      });

      await expect(doc.validate()).rejects.toThrow();
    });

    it('passes validation when iconType is image and iconAttachment is set', async () => {
      const iconAttachment = new Types.ObjectId();
      const doc = new BadgeType({
        name: 'Community Helper',
        description: 'Awarded manually by admins',
        iconKey: 'star',
        category: 'manual',
        levels: [],
        iconType: 'image',
        iconAttachment,
        createdBy,
      });

      await expect(doc.validate()).resolves.toBeUndefined();
      expect(doc.iconAttachment).toEqual(iconAttachment);
    });

    it('forces iconAttachment to null when iconType is materialSymbol, even if set', async () => {
      const doc = new BadgeType({
        name: 'Community Helper',
        description: 'Awarded manually by admins',
        iconKey: 'star',
        category: 'manual',
        levels: [],
        iconType: 'materialSymbol',
        iconAttachment: new Types.ObjectId(),
        createdBy,
      });

      await expect(doc.validate()).resolves.toBeUndefined();
      expect(doc.iconAttachment).toBeNull();
    });

    it('forces iconAttachment to null when iconType is emoji, even if set', async () => {
      const doc = new BadgeType({
        name: 'Community Helper',
        description: 'Awarded manually by admins',
        iconKey: 'star',
        category: 'manual',
        levels: [],
        iconType: 'emoji',
        iconAttachment: new Types.ObjectId(),
        createdBy,
      });

      await expect(doc.validate()).resolves.toBeUndefined();
      expect(doc.iconAttachment).toBeNull();
    });

    it('fails validation when category is automatic and iconType is image, even with a valid iconAttachment', async () => {
      const doc = new BadgeType({
        name: 'Editor',
        description: 'Awarded for editing pages',
        iconKey: 'edit',
        category: 'automatic',
        levels: [{ level: 1, name: 'Bronze', iconKey: 'edit', threshold: 1 }],
        iconType: 'image',
        iconAttachment: new Types.ObjectId(),
        createdBy,
      });

      await expect(doc.validate()).rejects.toThrow();
    });

    it('passes validation when category is automatic and iconType is materialSymbol or emoji', async () => {
      const materialSymbolDoc = new BadgeType({
        name: 'Editor',
        description: 'Awarded for editing pages',
        iconKey: 'edit',
        category: 'automatic',
        levels: [{ level: 1, name: 'Bronze', iconKey: 'edit', threshold: 1 }],
        iconType: 'materialSymbol',
        createdBy,
      });
      const emojiDoc = new BadgeType({
        name: 'Editor',
        description: 'Awarded for editing pages',
        iconKey: 'edit',
        category: 'automatic',
        levels: [{ level: 1, name: 'Bronze', iconKey: 'edit', threshold: 1 }],
        iconType: 'emoji',
        createdBy,
      });

      await expect(materialSymbolDoc.validate()).resolves.toBeUndefined();
      await expect(emojiDoc.validate()).resolves.toBeUndefined();
    });
  });
});
