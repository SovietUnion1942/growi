import type { IUserHasId } from '@growi/core/dist/interfaces';
import { ErrorV3 } from '@growi/core/dist/models';
import type { Request, RequestHandler } from 'express';

import type Crowi from '~/server/crowi';
import loginRequiredFactory from '~/server/middlewares/login-required';
import loggerFactory from '~/utils/logger';

import PushSubscription from '../../../models/push-subscription';
import type { ApiV3Response } from '../interfaces/apiv3-response';

const logger = loggerFactory(
  'growi:routes:apiv3:personal-setting:push-notification',
);

interface AuthedRequest extends Request {
  user: IUserHasId;
}

/**
 * GET /personal-setting/push-notification/vapid-public-key
 * VAPID公開鍵を返す。フロントエンドがPush Subscription作成時に必要とする。
 */
export const getVapidPublicKeyHandlerFactory = (
  crowi: Crowi,
): RequestHandler[] => {
  const loginRequiredStrictly = loginRequiredFactory(crowi);

  return [
    loginRequiredStrictly,
    async (req: AuthedRequest, res: ApiV3Response) => {
      const publicKey = process.env.VAPID_PUBLIC_KEY;
      if (publicKey == null) {
        return res.apiv3Err(
          new ErrorV3('VAPID key is not configured', 'vapid-not-configured'),
          500,
        );
      }
      return res.apiv3({ publicKey });
    },
  ];
};

/**
 * PUT /personal-setting/push-notification/subscribe
 * ブラウザで取得したPushSubscriptionを保存(既存のendpointなら上書き)。
 */
export const subscribePushNotificationHandlerFactory = (
  crowi: Crowi,
): RequestHandler[] => {
  const loginRequiredStrictly = loginRequiredFactory(crowi);

  return [
    loginRequiredStrictly,
    async (req: AuthedRequest, res: ApiV3Response) => {
      const { endpoint, keys, userAgent } = req.body;

      if (endpoint == null || keys?.p256dh == null || keys?.auth == null) {
        return res.apiv3Err(
          new ErrorV3('Invalid subscription payload', 'invalid-subscription'),
          400,
        );
      }

      try {
        const response = await PushSubscription.findOneAndUpdate(
          { userId: req.user._id, endpoint },
          {
            $set: {
              keys: { p256dh: keys.p256dh, auth: keys.auth },
              userAgent,
            },
          },
          { upsert: true, new: true },
        );
        return res.apiv3(response);
      } catch (err) {
        logger.error(err);
        return res.apiv3Err(
          new ErrorV3(err.toString(), 'saving-push-subscription-failed'),
        );
      }
    },
  ];
};

/**
 * DELETE /personal-setting/push-notification/subscribe
 * Subscriptionを解除する。endpoint未指定ならそのユーザーの全端末を解除。
 */
export const unsubscribePushNotificationHandlerFactory = (
  crowi: Crowi,
): RequestHandler[] => {
  const loginRequiredStrictly = loginRequiredFactory(crowi);

  return [
    loginRequiredStrictly,
    async (req: AuthedRequest, res: ApiV3Response) => {
      const { endpoint } = req.body;

      try {
        const query =
          endpoint != null
            ? { userId: req.user._id, endpoint }
            : { userId: req.user._id };

        await PushSubscription.deleteMany(query);
        return res.apiv3({});
      } catch (err) {
        logger.error(err);
        return res.apiv3Err(
          new ErrorV3(err.toString(), 'deleting-push-subscription-failed'),
        );
      }
    },
  ];
};

/**
 * GET /personal-setting/push-notification/subscriptions
 * ログイン中ユーザーが登録済みの端末一覧を取得(設定画面での表示用)。
 */
export const getPushSubscriptionsHandlerFactory = (
  crowi: Crowi,
): RequestHandler[] => {
  const loginRequiredStrictly = loginRequiredFactory(crowi);

  return [
    loginRequiredStrictly,
    async (req: AuthedRequest, res: ApiV3Response) => {
      try {
        const subscriptions = await PushSubscription.find(
          { userId: req.user._id },
          { endpoint: 1, userAgent: 1, createdAt: 1 },
        );
        return res.apiv3({ subscriptions });
      } catch (err) {
        logger.error(err);
        return res.apiv3Err(
          new ErrorV3(err.toString(), 'getting-push-subscriptions-failed'),
        );
      }
    },
  ];
};
