import { type JSX, useCallback, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { Controller, useForm } from 'react-hook-form';
import { Card, CardBody } from 'reactstrap';

import AdminCustomizeContainer from '~/client/services/AdminCustomizeContainer';
import { toastError, toastSuccess } from '~/client/util/toastr';

import { withUnstatedContainers } from '../../UnstatedUtils';
import { AdminCodeEditor } from '../Common/AdminCodeEditor';
import AdminUpdateButtonRow from '../Common/AdminUpdateButtonRow';

type Props = {
  adminCustomizeContainer: AdminCustomizeContainer;
};

type FormValues = {
  customizeHomeNotice: string;
};

const CustomizeHomeNoticeSetting = (props: Props): JSX.Element => {
  const { adminCustomizeContainer } = props;
  const { t } = useTranslation();

  const { control, handleSubmit, reset } = useForm<FormValues>();

  // Sync form with container state
  useEffect(() => {
    reset({
      customizeHomeNotice:
        adminCustomizeContainer.state.currentCustomizeHomeNotice || '',
    });
  }, [adminCustomizeContainer.state.currentCustomizeHomeNotice, reset]);

  const onSubmit = useCallback(
    async (data: FormValues) => {
      try {
        // Update container state before API call
        await adminCustomizeContainer.changeCustomizeHomeNotice(
          data.customizeHomeNotice,
        );
        await adminCustomizeContainer.updateCustomizeHomeNotice();
        toastSuccess(
          t('toaster.update_successed', {
            target: t('admin:customize_settings.home_notice'),
            ns: 'commons',
          }),
        );
      } catch (err) {
        toastError(err);
      }
    },
    [t, adminCustomizeContainer],
  );

  return (
    <div className="row">
      <div className="col-12">
        <h2 className="admin-setting-header">
          {t('admin:customize_settings.home_notice')}
        </h2>

        <Card className="card custom-card bg-body-tertiary my-3">
          <CardBody className="px-0 py-2">
            <span
              // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted translation markup
              dangerouslySetInnerHTML={{
                __html: t('admin:customize_settings.home_notice_detail'),
              }}
            />
          </CardBody>
        </Card>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div>
            <Controller
              name="customizeHomeNotice"
              control={control}
              render={({ field }) => (
                <AdminCodeEditor
                  language="html"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  aria-label={t('admin:customize_settings.home_notice')}
                />
              )}
            />
          </div>

          <AdminUpdateButtonRow
            type="submit"
            disabled={adminCustomizeContainer.state.retrieveError != null}
          />
        </form>
      </div>
    </div>
  );
};

const CustomizeHomeNoticeSettingWrapper = withUnstatedContainers(
  CustomizeHomeNoticeSetting,
  [AdminCustomizeContainer],
);

export default CustomizeHomeNoticeSettingWrapper;
