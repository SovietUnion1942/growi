import mongoose from 'mongoose';

import getPageModel from '~/server/models/page';
import {
  getModelSafely,
  getMongoUri,
  mongoOptions,
} from '~/server/util/mongoose-utils';
import loggerFactory from '~/utils/logger';

const logger = loggerFactory('growi:migrate:warn-existing-home-page');

const HOME_PATH = '/home';

export async function up() {
  logger.info('Apply migration: check for an existing /home page (reserved path)');
  await mongoose.connect(getMongoUri(), mongoOptions);

  const Page = getModelSafely('Page') || getPageModel();
  // Only real pages matter — empty container pages (isEmpty) carry no content.
  const page = await Page.findOne({ path: HOME_PATH, isEmpty: { $ne: true } });

  if (page != null) {
    // /home is now a reserved standalone route (home-page-v3, requirement 9.1).
    // This migration only warns — it never modifies, renames or deletes the page.
    logger.warn(
      `A wiki page exists at ${HOME_PATH}, which is now a reserved standalone route. `
        + 'The page is NOT modified or deleted; consider moving its content elsewhere. '
        + `Page id: ${page._id}`,
    );
  } else {
    logger.info('No page at /home - nothing to warn about');
  }
}

export async function down() {
  logger.info('Rollback migration: warn-existing-home-page (no-op — this migration only logs)');
  await mongoose.connect(getMongoUri(), mongoOptions);
}
