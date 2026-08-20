import type { Model } from 'mongoose';

export const GROWI_BOT_USERNAME = 'growi-ai';

// Lazily ensures the GROWI AI bot's User document exists, mirroring
// Conversation.findOrCreateBroadcast()'s upsert-on-first-use pattern. The
// bot is an ordinary (loginless -- no password, no email) User so every
// existing Messages code path (sender refs, participant serialization,
// search-based "start a conversation" flow) works unchanged, the same
// pattern already used in production for the 'discord-bot' account.
export const findOrCreateGrowiBotUser = (
  // biome-ignore lint/suspicious/noExplicitAny: crowi.models.User is typed Model<any> throughout this codebase (see users.integ.ts)
  User: Model<any>,
  // biome-ignore lint/suspicious/noExplicitAny: matches the Model<any> above
): Promise<any> => {
  // .exec() is required: a Mongoose Query is thenable but not a real
  // Promise (no Symbol.toStringTag/finally), which doesn't structurally
  // satisfy this function's declared Promise<any> return type.
  return User.findOneAndUpdate(
    { username: GROWI_BOT_USERNAME },
    {
      $setOnInsert: {
        username: GROWI_BOT_USERNAME,
        name: 'GROWI AI',
      },
    },
    { upsert: true, new: true },
  ).exec();
};
