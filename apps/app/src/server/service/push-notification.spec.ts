import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockConfigManager, setVapidDetails, sendNotification, find } =
  vi.hoisted(() => ({
    mockConfigManager: { getConfig: vi.fn() },
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
    find: vi.fn(),
  }));

vi.mock('./config-manager', () => ({ configManager: mockConfigManager }));
vi.mock('web-push', () => ({
  default: { setVapidDetails, sendNotification },
}));
vi.mock('../models/push-subscription', () => ({ default: { find } }));
vi.mock('~/utils/logger', () => ({
  default: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { sendPushNotificationToUser } from './push-notification';

const PAYLOAD = { title: 't', body: 'b' };

describe('sendPushNotificationToUser — feature gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VAPID_PUBLIC_KEY', 'pub');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'priv');
    vi.stubEnv('VAPID_SUBJECT', 'mailto:a@b.c');
    find.mockResolvedValue([]);
  });

  it('sends nothing and never touches web-push when app:pushNotificationEnabled is off', async () => {
    mockConfigManager.getConfig.mockReturnValue(false);
    const result = await sendPushNotificationToUser('u1', PAYLOAD);
    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(find).not.toHaveBeenCalled();
    expect(setVapidDetails).not.toHaveBeenCalled();
  });

  it('proceeds to look up subscriptions when the flag is on', async () => {
    mockConfigManager.getConfig.mockReturnValue(true);
    await sendPushNotificationToUser('u1', PAYLOAD);
    expect(setVapidDetails).toHaveBeenCalled();
    expect(find).toHaveBeenCalledWith({ userId: 'u1' });
  });
});
