import type { Types } from 'mongoose';

export type BadgeCategory = 'automatic' | 'manual';

export interface IBadgeLevel {
  level: number;
  name: string;
  iconKey: string;
  threshold: number;
}

export interface IBadgeType {
  name: string;
  description: string;
  iconKey: string;
  category: BadgeCategory;
  levels: IBadgeLevel[];
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
