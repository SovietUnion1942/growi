import webpush from 'web-push';

import loggerFactory from '~/utils/logger';

import PushSubscription from '../models/push-subscription';
import { configManager } from './config-manager';

const logger = loggerFactory('growi:service:push-notification');

let isConfigured = false;

const configureWebPushOnce = (): void => {
  if (isConfigured) {
    return;
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (publicKey == null || privateKey == null || subject == null) {
    logger.warn(
      'VAPID keys are not configured. Push notifications are disabled.',
    );
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  isConfigured = true;
};

export type PushNotificationPayload = {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
};

/**
 * 指定したユーザーIDに紐づく全端末へPush通知を送信する。
 * GROWI内部からも、Bot等の外部プロセスからAPI経由でも呼び出せる想定。
 */
export const sendPushNotificationToUser = async (
  userId: string,
  payload: PushNotificationPayload,
): Promise<{ sent: number; failed: number }> => {
  // Feature gate (app:pushNotificationEnabled): even with VAPID configured,
  // an operator can turn push delivery off entirely.
  if (!configManager.getConfig('app:pushNotificationEnabled')) {
    return { sent: 0, failed: 0 };
  }

  configureWebPushOnce();

  if (!isConfigured) {
    return { sent: 0, failed: 0 };
  }

  const subscriptions = await PushSubscription.find({ userId });

  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
        },
      };

      try {
        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify(payload),
        );
        sent += 1;
      } catch (err) {
        failed += 1;
        logger.error('Failed to send push notification', err);

        // 410(Gone)や404は、購読が失効している(端末側でアンインストール等)ことを示すので、
        // 該当のsubscriptionをDBから削除して掃除しておく
        const statusCode = err?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
        }
      }
    }),
  );

  return { sent, failed };
};

/**
 * 複数ユーザーへ一括送信する場合のヘルパー
 */
export const sendPushNotificationToUsers = async (
  userIds: string[],
  payload: PushNotificationPayload,
): Promise<{ sent: number; failed: number }> => {
  const results = await Promise.all(
    userIds.map((userId) => sendPushNotificationToUser(userId, payload)),
  );

  return results.reduce(
    (acc, r) => ({ sent: acc.sent + r.sent, failed: acc.failed + r.failed }),
    { sent: 0, failed: 0 },
  );
};
