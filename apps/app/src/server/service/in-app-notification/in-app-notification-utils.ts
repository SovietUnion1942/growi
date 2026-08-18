import type { IPage, IUser } from '@growi/core';

import type { IAuditLogBulkExportJob } from '~/features/audit-log-bulk-export/interfaces/audit-log-bulk-export';
import type { IPageBulkExportJob } from '~/features/page-bulk-export/interfaces/page-bulk-export';
import type { IUserBadge } from '~/features/user-badge/interfaces/badge';
import { SupportedTargetModel } from '~/interfaces/activity';
import * as pageSerializers from '~/models/serializers/in-app-notification-snapshot/page';
import * as pageBulkExportJobSerializers from '~/models/serializers/in-app-notification-snapshot/page-bulk-export-job';
import * as userBadgeSerializers from '~/models/serializers/in-app-notification-snapshot/user-badge';

type SnapshotTarget =
  | IUser
  | IPage
  | IPageBulkExportJob
  | IAuditLogBulkExportJob
  | IUserBadge;

const isIPage = (
  targetModel: string,
  target: SnapshotTarget,
): target is IPage => {
  return targetModel === SupportedTargetModel.MODEL_PAGE;
};

const isIPageBulkExportJob = (
  targetModel: string,
  target: SnapshotTarget,
): target is IPageBulkExportJob => {
  return targetModel === SupportedTargetModel.MODEL_PAGE_BULK_EXPORT_JOB;
};

const isIUserBadge = (
  targetModel: string,
  target: SnapshotTarget,
): target is IUserBadge => {
  return targetModel === SupportedTargetModel.MODEL_USER_BADGE;
};

// snapshots are infos about the target that are displayed in the notification, which should not change on target update/deletion
export const generateSnapshot = async (
  targetModel: string,
  target: SnapshotTarget,
): Promise<string | undefined> => {
  let snapshot: string | undefined;

  if (isIPage(targetModel, target)) {
    snapshot = pageSerializers.stringifySnapshot(target);
  } else if (isIPageBulkExportJob(targetModel, target)) {
    snapshot = await pageBulkExportJobSerializers.stringifySnapshot(target);
  } else if (isIUserBadge(targetModel, target)) {
    snapshot = await userBadgeSerializers.stringifySnapshot(target);
  }

  return snapshot;
};
