import { MongoMemoryServer } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';

import getPageModel from '~/server/models/page';
import { Config } from '~/server/models/config';
import { Revision } from '~/server/models/revision';
import { getModelSafely } from '~/server/util/mongoose-utils';

import { up, down } from './20260905010000-migrate-home-notice-to-config';

const CONFIG_KEY = 'customize:homeNotice';
const HOME_NOTICE_PATH = '/home-notice';

describe('migrate-home-notice-to-config', () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    // up()/down() call getMongoUri() themselves and self-connect (matching the
    // reference migration pattern) — point MONGO_URI at the memory server so
    // that self-connect resolves to the SAME connection string as this setup
    // connection (mongoose.connect() is a no-op, not an error, when the string
    // matches an already-connected string).
    process.env.MONGO_URI = mongod.getUri();
    await mongoose.connect(mongod.getUri());
  });

  beforeEach(async () => {
    await Config.deleteMany({});
    const Page = getModelSafely('Page') || getPageModel();
    await Page.deleteMany({});
    await Revision.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongod.stop();
  });

  it('skips migration when customize:homeNotice already has a value', async () => {
    await Config.create({ key: CONFIG_KEY, value: 'already configured notice' });
    const Page = getModelSafely('Page') || getPageModel();
    const page = await Page.create({ path: HOME_NOTICE_PATH });
    const revision = await Revision.create({
      pageId: page._id,
      body: 'this body must never overwrite the existing config value',
      format: 'markdown',
    });
    await Page.updateOne({ _id: page._id }, { revision: revision._id });

    await up();

    const config = await Config.findOne({ key: CONFIG_KEY });
    expect(config.value).toBe('already configured notice');
  });

  it('leaves customize:homeNotice unset when the /home-notice page does not exist', async () => {
    await up();

    const config = await Config.findOne({ key: CONFIG_KEY });
    expect(config).toBeNull();
  });

  it('leaves customize:homeNotice unset when the /home-notice page has an empty body', async () => {
    const Page = getModelSafely('Page') || getPageModel();
    const page = await Page.create({ path: HOME_NOTICE_PATH });
    const revision = await Revision.create({
      pageId: page._id,
      body: '',
      format: 'markdown',
    });
    await Page.updateOne({ _id: page._id }, { revision: revision._id });

    await up();

    const config = await Config.findOne({ key: CONFIG_KEY });
    expect(config).toBeNull();
  });

  it('copies the /home-notice page body into customize:homeNotice when present', async () => {
    const Page = getModelSafely('Page') || getPageModel();
    const page = await Page.create({ path: HOME_NOTICE_PATH });
    const revision = await Revision.create({
      pageId: page._id,
      body: '# Welcome\n\nThis is the club notice.',
      format: 'markdown',
    });
    await Page.updateOne({ _id: page._id }, { revision: revision._id });

    await up();

    const config = await Config.findOne({ key: CONFIG_KEY });
    expect(config.value).toBe('# Welcome\n\nThis is the club notice.');

    // The /home-notice Page/Revision must remain untouched (requirement 7.4)
    const reloadedPage = await Page.findById(page._id);
    expect(reloadedPage.path).toBe(HOME_NOTICE_PATH);
    expect(reloadedPage.revision.toString()).toBe(revision._id.toString());
    const reloadedRevision = await Revision.findById(revision._id);
    expect(reloadedRevision.body).toBe('# Welcome\n\nThis is the club notice.');
  });

  it('is idempotent: running up twice does not overwrite the copied value', async () => {
    const Page = getModelSafely('Page') || getPageModel();
    const page = await Page.create({ path: HOME_NOTICE_PATH });
    const revision = await Revision.create({
      pageId: page._id,
      body: 'original notice body',
      format: 'markdown',
    });
    await Page.updateOne({ _id: page._id }, { revision: revision._id });

    await up();
    // Simulate the page being edited after the one-time migration (requirement 7.3):
    // a second run of up() must not re-copy the new body.
    const secondRevision = await Revision.create({
      pageId: page._id,
      body: 'edited after migration - must not be re-copied',
      format: 'markdown',
    });
    await Page.updateOne({ _id: page._id }, { revision: secondRevision._id });

    await up();

    const config = await Config.findOne({ key: CONFIG_KEY });
    expect(config.value).toBe('original notice body');
  });

  it('down resets customize:homeNotice back to unset', async () => {
    await Config.create({ key: CONFIG_KEY, value: 'some notice' });

    await down();

    const config = await Config.findOne({ key: CONFIG_KEY });
    expect(config).toBeNull();
  });
});
