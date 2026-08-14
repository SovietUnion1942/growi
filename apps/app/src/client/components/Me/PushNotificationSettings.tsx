import type { FC } from 'react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';

import { apiv3Delete, apiv3Get, apiv3Put } from '~/client/util/apiv3-client';
import { toastError, toastSuccess } from '~/client/util/toastr';

// VAPID公開鍵(Base64URL文字列)をpushManager.subscribeが要求するUint8Arrayに変換する
const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

type NotificationSupportState = 'checking' | 'unsupported' | 'supported';

const PushNotificationSettings: FC = () => {
  const { t } = useTranslation();

  const [supportState, setSupportState] =
    useState<NotificationSupportState>('checking');
  const [permission, setPermission] =
    useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // 対応状況・現在の購読状態を初期化
  useEffect(() => {
    const init = async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setSupportState('unsupported');
        return;
      }
      setSupportState('supported');
      setPermission(Notification.permission);

      try {
        const registration = await navigator.serviceWorker.ready;
        const existingSubscription =
          await registration.pushManager.getSubscription();
        setIsSubscribed(existingSubscription != null);
      } catch (err) {
        // Service Worker未登録などのケースは「未購読」として扱う
        setIsSubscribed(false);
      }
    };
    init();
  }, []);

  const subscribeHandler = useCallback(async () => {
    setIsProcessing(true);
    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);

      if (permissionResult !== 'granted') {
        toastError(t('push_notification_settings.permission_denied'));
        return;
      }

      const { data } = await apiv3Get(
        '/personal-setting/push-notification/vapid-public-key',
      );
      const applicationServerKey = urlBase64ToUint8Array(data.publicKey);

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      const subscriptionJson = subscription.toJSON();
      await apiv3Put('/personal-setting/push-notification/subscribe', {
        endpoint: subscriptionJson.endpoint,
        keys: subscriptionJson.keys,
        userAgent: navigator.userAgent,
      });

      setIsSubscribed(true);
      toastSuccess(
        t('toaster.update_successed', {
          target: 'PushNotification Settings',
          ns: 'commons',
        }),
      );
    } catch (err) {
      toastError(err);
    } finally {
      setIsProcessing(false);
    }
  }, [t]);

  const unsubscribeHandler = useCallback(async () => {
    setIsProcessing(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription != null) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await apiv3Delete('/personal-setting/push-notification/subscribe', {
          endpoint,
        });
      }

      setIsSubscribed(false);
      toastSuccess(
        t('toaster.update_successed', {
          target: 'PushNotification Settings',
          ns: 'commons',
        }),
      );
    } catch (err) {
      toastError(err);
    } finally {
      setIsProcessing(false);
    }
  }, [t]);

  const toggleHandler = useCallback(
    (isChecked: boolean) => {
      if (isChecked) {
        subscribeHandler();
      } else {
        unsubscribeHandler();
      }
    },
    [subscribeHandler, unsubscribeHandler],
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
