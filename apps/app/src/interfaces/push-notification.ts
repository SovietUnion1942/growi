export interface IPushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface IPushSubscription<ObjectIdType = string> {
  userId: ObjectIdType;
  endpoint: string;
  keys: IPushSubscriptionKeys;
  userAgent?: string;
  createdAt?: Date;
}
