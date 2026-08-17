import type { FC } from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'next-i18next';

import { usePushNotificationSubscription } from '~/stores/push-notification';

const PushNotificationSettings: FC = () => {
  const { t } = useTranslation();

  const {
    supportState,
    permission,
    isSubscribed,
    isProcessing,
    subscribe,
    unsubscribe,
  } = usePushNotificationSubscription();

  const toggleHandler = useCallback(
    (isChecked: boolean) => {
      if (isChecked) {
        subscribe();
      } else {
        unsubscribe();
      }
    },
    [subscribe, unsubscribe],
  );

  return (
    <>
      <h2 className="border-bottom pb-2 my-4 fs-4">
        {t('push_notification_settings.push_notification_settings')}
      </h2>

      <div className="row">
        <div className="offset-md-3 col-md-6 text-start">
          {supportState === 'unsupported' && (
            <p className="text-muted small">
              {t('push_notification_settings.unsupported')}
            </p>
          )}

          {supportState === 'supported' && permission === 'denied' && (
            <p className="text-danger small">
              {t('push_notification_settings.permission_denied_hint')}
            </p>
          )}

          {supportState === 'supported' && permission !== 'denied' && (
            <div className="form-check form-switch form-check-success">
              <input
                type="checkbox"
                className="form-check-input"
                id="push-notification-toggle"
                checked={isSubscribed}
                disabled={isProcessing}
                onChange={(e) => toggleHandler(e.target.checked)}
              />
              <label
                className="form-label form-check-label"
                htmlFor="push-notification-toggle"
              >
                <strong>
                  {t('push_notification_settings.enable_push_notification')}
                </strong>
              </label>
              <p className="form-text text-muted small">
                {t('push_notification_settings.enable_push_notification_desc')}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default PushNotificationSettings;
