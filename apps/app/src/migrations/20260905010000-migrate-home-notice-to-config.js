import mongoose from 'mongoose';

import getPageModel from '~/server/models/page';
import { Config } from '~/server/models/config';
import { Revision } from '~/server/models/revision';
import {
  getModelSafely,
  getMongoUri,
  mongoOptions,
} from '~/server/util/mongoose-utils';
import loggerFactory from '~/utils/logger';

const logger = loggerFactory('growi:migrate:migrate-home-notice-to-config');

const CONFIG_KEY = 'customize:homeNotice';
const HOME_NOTICE_PATH = '/home-notice';

export async function up() {
  logger.info('Apply migration: Migrate /home-notice page body to customize:homeNotice config');
  await mongoose.connect(getMongoUri(), mongoOptions);

  const existingConfig = await Config.findOne({ key: CONFIG_KEY });
  if (existingConfig != null && existingConfig.value != null) {
    logger.info('customize:homeNotice already has a value - migration not needed');
    return;
  }

  const Page = getModelSafely('Page') || getPageModel();
  const page = await Page.findOne({ path: HOME_NOTICE_PATH });
  if (page == null || page.revision == null) {
    logger.info('/home-notice page does not exist or has no revision - leaving customize:homeNotice unset');
    return;
  }

  const revision = await Revision.findById(page.revision);
  const body = revision?.body;
  if (body == null || body.length === 0) {
    logger.info('/home-notice page body is empty - leaving customize:homeNotice unset');
    return;
  }

  // Copy the body once into the config value. The /home-notice Page/Revision
  // documents themselves are never modified or deleted (requirement 7.4).
  await Config.create({ key: CONFIG_KEY, value: body });

  logger.info('Migration has successfully applied');
}

export async function down() {
  logger.info('Rollback migration: Migrate /home-notice page body to customize:homeNotice config');
  await mongoose.connect(getMongoUri(), mongoOptions);

  await Config.deleteOne({ key: CONFIG_KEY });

  logger.info('Migration down has successfully applied');
}
