import type { GetServerSideProps, GetServerSidePropsContext } from 'next';
import type { ColorScheme, IUserHasId } from '@growi/core';
import mongoose from 'mongoose';

import type { CrowiRequest } from '~/interfaces/crowi-request';
import {
  type MessagesMode,
  normalizeMessagesMode,
} from '~/interfaces/messages-mode';
import {
  MODERN_UI_COOKIE,
  type ModernUiMode,
  normalizeModernUiMode,
  THEME_COOKIE,
} from '~/interfaces/modern-ui-mode';
import { parseUa, resolveUiTier, type UiTier } from '~/interfaces/ui-tier';
import { getGrowiVersion } from '~/utils/growi-version';
import loggerFactory from '~/utils/logger';

import {
  detectNextjsRoutingType,
  type NextjsRoutingType,
} from '../utils/nextjs-routing-utils';

const logger = loggerFactory('growi:pages:common-props:commons');

export type CommonInitialProps = {
  appTitle: string;
  siteUrl: string | undefined;
  siteUrlWithEmptyValueWarn: string;
  confidential: string;
  growiVersion: string;
  isDefaultLogo: boolean;
  customTitleTemplate: string;
  growiCloudUri: string | undefined;
  growiAppIdForGrowiCloud: number | undefined;
  forcedColorScheme?: ColorScheme;
  aiEnabled: boolean;
  nasStorageEnabled: boolean;
  messagesMode: MessagesMode;
  modernUiMode: ModernUiMode;
  /** The resolved UI tier for this request (mode x cookie x User-Agent). */
  uiTier: UiTier;
  /** This client's UA is below the documented minimum (drives the banner). */
  uaBelowMin: boolean;
  /** OS key for the system-requirements table highlight. */
  uaOs: string;
  /** Whether the system-requirements notice/banner is enabled instance-wide. */
  sysreqNotice: boolean;
  messagesImageUploadEnabled: boolean;
  aiVisionEnabled: boolean;
  pwaEnabled: boolean;
  pushNotificationEnabled: boolean;
  userBadgeEnabled: boolean;
  wikiGapSuggestionsEnabled: boolean;
  boardEnabled: boolean;
};

export const getServerSideCommonInitialProps: GetServerSideProps<
  CommonInitialProps
> = async (context: GetServerSidePropsContext) => {
  const req = context.req as CrowiRequest;
  const { crowi } = req;
  const {
    appService,
    configManager,
    attachmentService,
    customizeService,
    growiInfoService,
  } = crowi;

  const isCustomizedLogoUploaded = await attachmentService.isBrandLogoExist();
  const isDefaultLogo =
    crowi.configManager.getConfig('customize:isDefaultLogo') ||
    !isCustomizedLogoUploaded;
  const uiTier = resolveUiTier({
    mode: normalizeModernUiMode(configManager.getConfig('app:modernUiMode')),
    cookie: req.cookies?.[MODERN_UI_COOKIE],
    ua: req.headers['user-agent'],
  });

  // A viewer's `grw-theme` cookie override (see _document) can carry its own
  // forced color scheme (a light-/dark-only preset). Fall back to the
  // instance theme's when the cookie is absent or invalid. Ignored under the
  // glass skin — the modern skin and the preset themes are one exclusive
  // choice, so a stale `grw-theme` cookie must not force a color scheme.
  const themeCookieAsset =
    uiTier === 'glass'
      ? null
      : customizeService.resolvePresetThemeAsset(req.cookies?.[THEME_COOKIE]);
  const forcedColorScheme =
    themeCookieAsset != null
      ? themeCookieAsset.forcedColorScheme
      : crowi.customizeService.forcedColorScheme;

  return {
    props: {
      appTitle: appService.getAppTitle(),
      siteUrl: configManager.getConfig('app:siteUrl'),
      siteUrlWithEmptyValueWarn: growiInfoService.getSiteUrl(),
      confidential: appService.getAppConfidential() || '',
      growiVersion: getGrowiVersion(),
      isDefaultLogo,
      customTitleTemplate: customizeService.customTitleTemplate,
      growiCloudUri: configManager.getConfig('app:growiCloudUri'),
      growiAppIdForGrowiCloud: configManager.getConfig(
        'app:growiAppIdForCloud',
      ),
      forcedColorScheme,
      // Routed through crowi (not a direct isAiReady import) on purpose: this
      // runs in the Next SSR realm, where a directly-imported configManager is a
      // separate, never-loaded instance. crowi.isAiReady() executes in the
      // Express realm against the loaded config, and importing the server-only
      // verdict module here would also leak the mongoose Config model into the
      // client bundle. The verdict (= enabled && configured) mirrors the mastra
      // route guard, keeping UI and API aligned.
      aiEnabled: crowi.isAiReady(),
      // Routed through crowi for the same realm-safety reason as aiEnabled: the
      // NAS root health-checker singleton is populated by `probeOnBoot` only in
      // the Express realm. Verdict mirrors the admin `enabled` field
      // (`state === 'ready'`), keeping the UI affordance and API aligned.
      nasStorageEnabled: crowi.isNasStorageReady(),
      // Messages (DM / chat) feature level. Read straight from the loaded
      // config (crowi.configManager, not a directly-imported instance -- see
      // the aiEnabled note above) and normalized so a stale/typo'd value can
      // never reach the client as anything but a valid MessagesMode.
      messagesMode: normalizeMessagesMode(
        configManager.getConfig('app:messagesMode'),
      ),
      // Modern UI skin level. Normalized so a stale/typo'd config value can
      // never reach the client as anything but a valid ModernUiMode.
      modernUiMode: normalizeModernUiMode(
        configManager.getConfig('app:modernUiMode'),
      ),
      // Resolved UI tier + UA facts for this request. `_document` does its own
      // resolveUiTier for the FOUC-critical attribute; these feed client-side
      // UI (the /me modern card, the system-requirements banner).
      uiTier,
      uaBelowMin: parseUa(req.headers['user-agent']).belowMin,
      uaOs: parseUa(req.headers['user-agent']).os,
      sysreqNotice: configManager.getConfig('app:sysreqNotice'),
      messagesImageUploadEnabled: configManager.getConfig(
        'app:messagesImageUploadEnabled',
      ),
      // ai:vision — drives whether the AI chat composer offers image
      // attachment. Enforcement is server-side (post-message strips image
      // parts); this only hides a useless affordance.
      aiVisionEnabled: configManager.getConfig('ai:vision'),
      // app:pwaEnabled — manifest link (_document) + service-worker
      // registration (_app). app:pushNotificationEnabled — post-login
      // permission prompt + the /me push tab (also needs pwaEnabled).
      pwaEnabled: configManager.getConfig('app:pwaEnabled'),
      pushNotificationEnabled: configManager.getConfig(
        'app:pushNotificationEnabled',
      ),
      // app:userBadgeEnabled — hides the admin badge section, all badge
      // display and the badge-type catalog fetch when off.
      userBadgeEnabled: configManager.getConfig('app:userBadgeEnabled'),
      // app:wikiGapSuggestionsEnabled — the :::wiki-gap-suggestions viewer
      // and the AI-chat gap chips render nothing when off.
      wikiGapSuggestionsEnabled: configManager.getConfig(
        'app:wikiGapSuggestionsEnabled',
      ),
      // app:boardEnabled — the :board directive viewer and /board/* editor
      // pages are inert when off.
      boardEnabled: configManager.getConfig('app:boardEnabled'),
    } satisfies CommonInitialProps,
  };
};

export const isCommonInitialProps = (
  props: unknown,
): props is CommonInitialProps => {
  if (typeof props !== 'object' || props === null) {
    logger.warn('isCommonInitialProps: props is not an object or is null');
    return false;
  }

  const p = props as Record<string, unknown>;

  if (!('growiVersion' in p && 'appTitle' in p && 'siteUrl' in p)) {
    logger.warn(
      'isCommonInitialProps: props does not have growiVersion property',
    );
    return false;
  }

  return true;
};

export type CommonEachProps = {
  nextjsRoutingType: NextjsRoutingType;
  currentPathname: string;
  nextjsRoutingPage?: string; // must be set by each page
  currentUser?: IUserHasId;
  isMaintenanceMode: boolean;
  redirectDestination?: string | null;
};

/**
 * Type guard for SameRouteEachProps validation
 * Lightweight validation for same-route navigation
 */
function isValidCommonEachRouteProps(
  props: unknown,
  shouldContainNextjsRoutingPage = false,
): props is CommonEachProps {
  if (typeof props !== 'object' || props === null) {
    logger.warn(
      'isValidCommonEachRouteProps: props is not an object or is null',
    );
    return false;
  }

  const p = props as Record<string, unknown>;

  // Essential properties validation
  if (shouldContainNextjsRoutingPage) {
    if (
      typeof p.nextjsRoutingPage !== 'string' &&
      p.nextjsRoutingPage !== undefined
    ) {
      logger.warn(
        { nextjsRoutingPage: p.nextjsRoutingPage },
        'isValidCommonEachRouteProps: nextjsRoutingPage is not a string or null',
      );
      return false;
    }
  }
  if (typeof p.currentPathname !== 'string') {
    logger.warn(
      { currentPathname: p.currentPathname },
      'isValidCommonEachRouteProps: currentPathname is not a string',
    );
    return false;
  }
  if (typeof p.isMaintenanceMode !== 'boolean') {
    logger.warn(
      { isMaintenanceMode: p.isMaintenanceMode },
      'isValidCommonEachRouteProps: isMaintenanceMode is not a boolean',
    );
    return false;
  }

  return true;
}

export const getServerSideCommonEachProps = async (
  context: GetServerSidePropsContext,
  nextjsRoutingPage?: string,
): ReturnType<GetServerSideProps<CommonEachProps>> => {
  const req = context.req as CrowiRequest;
  const { crowi, user } = req;
  const { appService } = crowi;

  const url = new URL(context.resolvedUrl, 'http://example.com');

  const currentPathname = decodeURIComponent(url.pathname);

  const isMaintenanceMode = appService.isMaintenanceMode();

  let currentUser: IUserHasId | undefined;
  if (user != null) {
    const User = mongoose.model<IUserHasId>('User');
    const userData = await User.findById(user.id).populate({
      path: 'imageAttachment',
      select: 'filePathProxied',
    });
    currentUser = userData?.toObject();
  }

  // Redirect destination for page transition by next/link
  let redirectDestination: string | null = null;
  if (!crowi.aclService.isGuestAllowedToRead() && currentUser == null) {
    redirectDestination = '/login';
  } else if (!isMaintenanceMode && currentPathname === '/maintenance') {
    redirectDestination = '/';
  } else if (
    isMaintenanceMode &&
    !currentPathname.match('/admin/*') &&
    !(currentPathname === '/maintenance')
  ) {
    redirectDestination = '/maintenance';
  } else {
    redirectDestination = null;
  }

  const props = {
    nextjsRoutingType: detectNextjsRoutingType(context, nextjsRoutingPage),
    currentPathname,
    nextjsRoutingPage,
    currentUser,
    isMaintenanceMode,
    redirectDestination,
  } satisfies CommonEachProps;

  const shouldContainNextjsRoutingPage = nextjsRoutingPage != null;
  if (!isValidCommonEachRouteProps(props, shouldContainNextjsRoutingPage)) {
    throw new Error('Invalid common each route props structure');
  }

  return { props };
};
