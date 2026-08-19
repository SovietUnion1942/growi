import type { IUserHasId } from '@growi/core/dist/interfaces';
import type { Request, RequestHandler } from 'express';

import type Crowi from '~/server/crowi';
import loginRequiredFactory from '~/server/middlewares/login-required';
import { hasAnsweredCurrentMonth } from '~/server/service/attendance-reminder';

import type { ApiV3Response } from '../interfaces/apiv3-response';

interface AuthedRequest extends Request {
  user: IUserHasId;
}

/**
 * GET /personal-setting/attendance-status
 * ログイン中ユーザーが今月分の出欠を一度でも回答済みかどうかを返す。
 */
export const getAttendanceStatusHandlerFactory = (
  crowi: Crowi,
): RequestHandler[] => {
  const loginRequiredStrictly = loginRequiredFactory(crowi);

  return [
    loginRequiredStrictly,
    async (req: AuthedRequest, res: ApiV3Response) => {
      const answered = await hasAnsweredCurrentMonth(req.user.username);
      return res.apiv3({ answered });
    },
  ];
};
