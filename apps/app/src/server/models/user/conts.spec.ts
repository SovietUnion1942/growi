/**
 * Unit tests for models/user/conts.ts
 *
 * Asserts that USER_FIELDS_EXCEPT_CONFIDENTIAL — the Mongoose populate({select})
 * whitelist shared by page.populateDataToShowRevision (page.creator /
 * page.lastUpdateUser / page.deleteUser / revision.author) and
 * Page.findRecentUpdatedPages's populateDataToList (page.lastUpdateUser) —
 * includes badgeSummaryCached, so badge data is available at both call sites.
 */

import { USER_FIELDS_EXCEPT_CONFIDENTIAL } from './conts';

describe('USER_FIELDS_EXCEPT_CONFIDENTIAL', () => {
  it('includes badgeSummaryCached as a space-separated field', () => {
    const fields = USER_FIELDS_EXCEPT_CONFIDENTIAL.split(' ');
    expect(fields).toContain('badgeSummaryCached');
  });
});
