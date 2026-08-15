import type { Types } from 'mongoose';

import type { IAttachment } from './attachment.js';
import type { Ref } from './common.js';
import type { HasObjectId } from './has-object-id.js';
import type { Lang } from './lang.js';

/**
 * One entry of a user's denormalized badge-grant cache: the highest level
 * held within a single badge series (features/user-badge's
 * `BadgeGrantService` is the sole writer of `IUser.badgeSummaryCached`, see
 * that feature's design.md). A manual-category badge (whose grants never
 * carry a `level`) surfaces as its own single entry with `level: null`.
 *
 * Structurally mirrors
 * `apps/app/src/features/user-badge/interfaces/badge.ts`'s
 * `IUserBadgeSummaryEntry`; duplicated here rather than imported, since
 * `@growi/core` must not depend on `apps/app` (dependency-direction rule) --
 * keep the two shapes in sync if either changes.
 */
export type IUserBadgeSummaryEntry = {
  badgeType: Types.ObjectId;
  iconKey: string;
  name: string;
  level: number | null;
};

export type IUser = {
  name: string;
  username: string;
  email: string;
  password: string;
  image?: string; // for backward conpatibility
  imageAttachment?: Ref<IAttachment>;
  imageUrlCached: string;
  isGravatarEnabled: boolean;
  admin: boolean;
  readOnly: boolean;
  apiToken?: string;
  isEmailPublished: boolean;
  isInvitationEmailSended: boolean;
  lang: Lang;
  slackMemberId?: string;
  createdAt: Date;
  lastLoginAt?: Date;
  contributionsMigratedAt?: Date;
  introduction: string;
  status: IUserStatus;
  /** Sole writer: features/user-badge's `BadgeGrantService`. */
  badgeSummaryCached?: IUserBadgeSummaryEntry[];
};

export type IUserGroupRelation = {
  relatedGroup: Ref<IUserGroup>;
  relatedUser: Ref<IUser>;
  createdAt: Date;
};

export type IUserGroup = {
  name: string;
  createdAt: Date;
  description: string;
  parent: Ref<IUserGroup> | null;
};

export const USER_STATUS = {
  REGISTERED: 1,
  ACTIVE: 2,
  SUSPENDED: 3,
  DELETED: 4,
  INVITED: 5,
} as const;
export type IUserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

export type IUserHasId = IUser & HasObjectId;
export type IUserGroupHasId = IUserGroup & HasObjectId;
export type IUserGroupRelationHasId = IUserGroupRelation & HasObjectId;

export type IAdminExternalAccount<P> = {
  _id: string;
  providerType: P;
  accountId: string;
  user: IUser;
  createdAt: Date;
};
