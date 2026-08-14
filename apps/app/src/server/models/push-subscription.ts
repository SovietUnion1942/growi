import type { Document, Model, Types } from 'mongoose';
import { Schema } from 'mongoose';

import type { IPushSubscription } from '~/interfaces/push-notification';

import { getOrCreateModel } from '../util/mongoose-utils';

export interface PushSubscriptionDocument
  extends IPushSubscription<Types.ObjectId>,
    Document {}

export type PushSubscriptionModel = Model<PushSubscriptionDocument>;

const pushSubscriptionSchema = new Schema<
  PushSubscriptionDocument,
  PushSubscriptionModel
>({
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  endpoint: { type: String, required: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
  userAgent: { type: String },
  createdAt: { type: Date, default: Date.now },
});

// 同じユーザーが同じ端末(endpoint)を重複登録しないようにする
pushSubscriptionSchema.index({ userId: 1, endpoint: 1 }, { unique: true });

export default getOrCreateModel<
  PushSubscriptionDocument,
  PushSubscriptionModel
>('PushSubscription', pushSubscriptionSchema);
