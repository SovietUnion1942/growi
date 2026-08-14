// GROWI Web Push 実ブラウザE2E送信テスト用スクリプト
// 使い方: node scripts/test-push-notification.mjs <userId>
// userId は mongosh で db.users.findOne({ email: '...' }, { _id: 1 }) から取得する

import dotenvFlow from 'dotenv-flow';
import mongoose from 'mongoose';
import webpush from 'web-push';

dotenvFlow.config();

const userId = process.argv[2];

if (userId == null) {
  console.error('Usage: node scripts/test-push-notification.mjs <userId>');
  process.exit(1);
}

const pushSubscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  endpoint: { type: String, required: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
  userAgent: { type: String },
  createdAt: { type: Date, default: Date.now },
});
const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema);

const getMongoUri = () =>
  process.env.MONGOLAB_URI ||
  process.env.MONGODB_URI ||
  process.env.MONGOHQ_URL ||
  process.env.MONGO_URI ||
  'mongodb://mongo/growi';

const main = async () => {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (VAPID_PUBLIC_KEY == null || VAPID_PRIVATE_KEY == null || VAPID_SUBJECT == null) {
    console.error('VAPID keys are not set in the environment.');
    process.exit(1);
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  await mongoose.connect(getMongoUri());

  const subscriptions = await PushSubscription.find({ userId });
  console.log(`Found ${subscriptions.length} subscription(s) for userId=${userId}`);

  const payload = JSON.stringify({
    title: '物理部Wiki',
    body: 'サーバーからのE2Eテスト通知だよ',
    url: '/',
  });

  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    };
    try {
      await webpush.sendNotification(pushSubscription, payload);
      sent += 1;
      console.log(`OK: ${sub.endpoint.slice(0, 60)}...`);
    } catch (err) {
      failed += 1;
      console.error(`NG (${err.statusCode}): ${sub.endpoint.slice(0, 60)}...`, err.body ?? err.message);
      if (err.statusCode === 404 || err.statusCode === 410) {
        await PushSubscription.deleteOne({ _id: sub._id });
        console.log('  -> stale subscription removed');
      }
    }
  }

  console.log(`\nResult: sent=${sent}, failed=${failed}`);
  await mongoose.disconnect();
  process.exit(failed > 0 && sent === 0 ? 1 : 0);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
