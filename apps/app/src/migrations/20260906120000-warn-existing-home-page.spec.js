import { MongoMemoryServer } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';

import getPageModel from '~/server/models/page';
import { getModelSafely } from '~/server/util/mongoose-utils';

const { infoSpy, warnSpy, errorSpy } = vi.hoisted(() => ({
  infoSpy: vi.fn(),
  warnSpy: vi.fn(),
  errorSpy: vi.fn(),
}));

vi.mock('~/utils/logger', () => ({
  default: () => ({
    info: infoSpy,
    warn: warnSpy,
    error: errorSpy,
    debug: vi.fn(),
  }),
}));

const { up, down } = await import('./20260906120000-warn-existing-home-page');

const HOME_PATH = '/home';

describe('warn-existing-home-page', () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongod.getUri();
    await mongoose.connect(mongod.getUri());
  });

  beforeEach(async () => {
    const Page = getModelSafely('Page') || getPageModel();
    await Page.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongod.stop();
  });

  it('warns and leaves the page untouched when a real /home page exists', async () => {
    const Page = getModelSafely('Page') || getPageModel();
    const page = await Page.create({ path: HOME_PATH });

    await up();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('/home');

    // The /home page must remain completely unchanged (no delete / rename / mutate)
    const reloaded = await Page.findById(page._id);
    expect(reloaded).not.toBeNull();
    expect(reloaded._id.toString()).toBe(page._id.toString());
    expect(reloaded.path).toBe(HOME_PATH);
  });

  it('does not warn when only an empty container page exists at /home', async () => {
    const Page = getModelSafely('Page') || getPageModel();
    await Page.create({ path: HOME_PATH, isEmpty: true });

    await up();

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn and does not throw when there is no /home page', async () => {
    await expect(up()).resolves.not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('down is a no-op: it does not throw and changes no data', async () => {
    const Page = getModelSafely('Page') || getPageModel();
    const page = await Page.create({ path: HOME_PATH });

    await expect(down()).resolves.not.toThrow();

    const reloaded = await Page.findById(page._id);
    expect(reloaded.path).toBe(HOME_PATH);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
