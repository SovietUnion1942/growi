import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';

import { apiv3Delete, apiv3Get, apiv3Put } from '~/client/util/apiv3-client';
import { toastError, toastSuccess } from '~/client/util/toastr';
import { useCurrentUser } from '~/states/global';

// VAPID公開鍵(Base64URL文字列)をpushManager.subscribeが要求するUint8Arrayに変換する
const urlBase64ToUint8Array = (
  base64String: string,
): Uint8Array<ArrayBuffer> => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

export type NotificationSupportState = 'checking' | 'unsupported' | 'supported';

type UsePushNotificationSubscriptionResult = {
  supportState: NotificationSupportState;
  permission: NotificationPermission;
  isSubscribed: boolean;
  isProcessing: boolean;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
};

export const usePushNotificationSubscription =
  (): UsePushNotificationSubscriptionResult => {
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

    const subscribe = useCallback(async () => {
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

    const unsubscribe = useCallback(async () => {
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

    return {
      supportState,
      permission,
      isSubscribed,
      isProcessing,
      subscribe,
      unsubscribe,
    };
  };

// Browsers remember the user's choice per-origin once they answer the
// permission prompt (Notification.permission flips away from 'default'
// permanently), so this only ever prompts once per browser/user.
export const useAutoRequestPushNotificationPermission = (): void => {
  const currentUser = useCurrentUser();
  const { supportState, permission, subscribe } =
    usePushNotificationSubscription();

  useEffect(() => {
    if (currentUser == null) return;
    if (supportState !== 'supported') return;
    if (permission !== 'default') return;

    subscribe();
    // subscribe/permission/supportState intentionally excluded: this effect
    // must fire at most once per mount, driven only by "did the user log in"
    // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  }, [currentUser]);
};
