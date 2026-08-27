import { mock } from 'vitest-mock-extended';

import type Crowi from '~/server/crowi';
import { hasAnsweredCurrentMonth } from '~/server/service/attendance-reminder';

import { getAttendanceStatusHandlerFactory } from './attendance-status';

vi.mock('~/server/middlewares/login-required', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('~/server/service/attendance-reminder', () => ({
  hasAnsweredCurrentMonth: vi.fn(),
}));

describe('getAttendanceStatusHandlerFactory', () => {
  const handler = getAttendanceStatusHandlerFactory(mock<Crowi>())[1];

  it('responds with answered: true when the user has answered this month', async () => {
    vi.mocked(hasAnsweredCurrentMonth).mockResolvedValue(true);

    const req = { user: { username: 'someone' } };
    const apiv3 = vi.fn();
    const res = { apiv3 };

    // biome-ignore lint/suspicious/noExplicitAny: minimal req/res shape for this handler
    await handler(req as any, res as any);

    expect(apiv3).toHaveBeenCalledWith({ answered: true });
  });

  it('responds with answered: false when the user has not answered this month', async () => {
    vi.mocked(hasAnsweredCurrentMonth).mockResolvedValue(false);

    const req = { user: { username: 'someone-else' } };
    const apiv3 = vi.fn();
    const res = { apiv3 };

    // biome-ignore lint/suspicious/noExplicitAny: minimal req/res shape for this handler
    await handler(req as any, res as any);

    expect(apiv3).toHaveBeenCalledWith({ answered: false });
  });
});
