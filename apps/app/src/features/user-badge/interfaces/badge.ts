import type { Types } from 'mongoose';

export type BadgeCategory = 'automatic' | 'manual';

export type BadgeIconType = 'materialSymbol' | 'emoji' | 'image';

export interface IBadgeLevel {
  level: number;
  name: string;
  iconKey: string;
  threshold: number;
}

export interface IBadgeType {
  name: string;
  description: string;
  iconType?: BadgeIconType; // when 'image', iconKey is ignored and iconAttachment is used instead
  iconKey: string;
  category: BadgeCategory;
  levels: IBadgeLevel[];
  iconAttachment?: Types.ObjectId | null; // ref Attachment, only set when iconType === 'image'
  isDeleted: boolean;
  deletedAt: Date | null;
  createdBy: Types.ObjectId;
}

export interface IUserBadge {
  user: Types.ObjectId;
  badgeType: Types.ObjectId;
  level: number | null;
  grantedAt: Date;
  grantedBy: Types.ObjectId | null;
  note: string | null;
}

export interface IUserBadgeSummaryEntry {
  badgeType: Types.ObjectId;
  iconKey: string;
  name: string;
  level: number | null;
}
