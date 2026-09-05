/**
 * The legacy wiki page that used to hold the home-page notice body before it
 * moved to the `customize:homeNotice` config field (admin Customize screen).
 * The home page no longer reads this page live; this constant is kept only
 * for the one-time migration that copies an existing page's body into the
 * new config field.
 */
export const HOME_NOTICE_PATH = '/home-notice';
