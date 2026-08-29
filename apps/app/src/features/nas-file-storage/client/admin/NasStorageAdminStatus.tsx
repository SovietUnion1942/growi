import type { JSX } from 'react';
import { useTranslation } from 'next-i18next';
import prettyBytes from 'pretty-bytes';

import type { NasRootStatus } from './use-nas-admin-status';
import { useNasAdminStatus } from './use-nas-admin-status';

/** Row helper: a right-aligned label cell + a value cell, matching admin tables. */
const StatusRow = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element => (
  <tr>
    <th className="col-md-4">{label}</th>
    <td>{children}</td>
  </tr>
);

/**
 * Renders the root-resolution line for each `NasRootStatus` variant. `ready` and
 * `unavailable` expose `resolvedRoot` (admin-only UI — the admin configured it);
 * `misconfigured` surfaces the concrete reason so the operator can fix the env
 * (Req 1.3); `unconfigured` says the env var is unset (Req 1.4).
 */
const RootStatusValue = ({
  status,
}: {
  status: NasRootStatus;
}): JSX.Element => {
  const { t } = useTranslation();

  switch (status.state) {
    case 'ready':
      return (
        <>
          <span className="badge bg-success me-2">
            {t('nas_storage.admin.root.ready')}
          </span>
          <code>{status.resolvedRoot}</code>
        </>
      );
    case 'unavailable':
      return (
        <>
          <span className="badge bg-warning me-2">
            {t('nas_storage.admin.root.unavailable')}
          </span>
          <code>{status.resolvedRoot}</code>
        </>
      );
    case 'misconfigured':
      return (
        <>
          <span className="badge bg-danger me-2">
            {t('nas_storage.admin.root.misconfigured')}
          </span>
          <span className="text-danger">
            {t(`nas_storage.admin.reason.${status.reason}`)}
          </span>
        </>
      );
    case 'unconfigured':
      return (
        <span className="text-muted">
          {t('nas_storage.admin.root.unconfigured')}
        </span>
      );
    case 'disabled':
      return (
        <span className="text-muted">
          {t('nas_storage.admin.root.disabled')}
        </span>
      );
  }
};

/**
 * Admin panel status section for the NAS file storage feature.
 *
 * Reads `GET /_api/v3/admin/nas-storage/status` and displays the four response
 * fields: the enabled/disabled state, the root-resolution result (including the
 * `misconfigured` reason), the group restriction, and the per-file size cap.
 *
 * Requirements: 1.3 (misconfigured reason shown), 1.4 (enabled state + whether
 * the current root resolves).
 */
export const NasStorageAdminStatus = (): JSX.Element => {
  const { t } = useTranslation();
  const { data, error, isLoading } = useNasAdminStatus();

  const heading = (
    <h2 className="admin-setting-header">{t('nas_storage.admin.title')}</h2>
  );

  if (isLoading) {
    return (
      <div data-testid="nas-admin-status">
        {heading}
        <div
          data-testid="nas-admin-status-loading"
          className="spinner-border spinner-border-sm text-muted"
          role="status"
        >
          <span className="visually-hidden">
            {t('nas_storage.admin.title')}
          </span>
        </div>
      </div>
    );
  }

  if (error != null || data == null) {
    return (
      <div data-testid="nas-admin-status">
        {heading}
        <div className="alert alert-danger" role="alert">
          <span className="material-symbols-outlined me-1 align-middle">
            error
          </span>
          {t('nas_storage.admin.fetch_error')}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="nas-admin-status">
      {heading}
      <table className="table table-sm table-bordered">
        <tbody>
          <StatusRow label={t('nas_storage.admin.enabled_label')}>
            {data.enabled ? (
              <span className="badge bg-info">
                {t('nas_storage.admin.enabled')}
              </span>
            ) : (
              <span className="badge bg-secondary">
                {t('nas_storage.admin.disabled')}
              </span>
            )}
          </StatusRow>

          <StatusRow label={t('nas_storage.admin.root_label')}>
            <RootStatusValue status={data.status} />
          </StatusRow>

          <StatusRow label={t('nas_storage.admin.group_restriction_label')}>
            {data.groupRestriction != null ? (
              <code>{data.groupRestriction}</code>
            ) : (
              <span className="text-muted">
                {t('nas_storage.admin.group_restriction_none')}
              </span>
            )}
          </StatusRow>

          <StatusRow label={t('nas_storage.admin.max_file_size_label')}>
            {data.maxFileSizeBytes != null ? (
              prettyBytes(data.maxFileSizeBytes)
            ) : (
              <span className="text-muted">
                {t('nas_storage.admin.max_file_size_unlimited')}
              </span>
            )}
          </StatusRow>
        </tbody>
      </table>
    </div>
  );
};
