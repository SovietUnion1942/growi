import type { ColorScheme } from '@growi/core';
import { getForcedColorScheme } from '@growi/core/dist/utils';
import {
  DefaultThemeMetadata,
  manifestPath,
  PresetThemesMetadatas,
} from '@growi/preset-themes';
import path from 'path';

import { growiPluginService } from '~/features/growi-plugin/server/services';
import loggerFactory from '~/utils/logger';

import type Crowi from '../crowi';
import S2sMessage from '../models/vo/s2s-message';
import { configManager } from './config-manager';
import type { S2sMessageHandlable } from './s2s-messaging/handlable';

const logger = loggerFactory('growi:service:CustomizeService');

/**
 * the service class of CustomizeService
 */
export class CustomizeService implements S2sMessageHandlable {
  s2sMessagingService: any;

  appService: any;

  lastLoadedAt?: Date;

  customCss?: string;

  customTitleTemplate!: string;

  theme: string;

  themeHref: string | undefined;

  forcedColorScheme?: ColorScheme;

  /**
   * preset-themes vite manifest (theme file name -> built asset). Loaded once
   * in initGrowiTheme() and cached so the per-request preset-theme lookup
   * (resolvePresetThemeAsset) never does a dynamic JSON import - see
   * apps/app/.claude/rules/esm-authoring.md ("JSON imports require an import
   * attribute": a dynamic manifest import on a request path once 500-ed prod).
   */
  private presetThemesManifest?: Record<string, { file: string }>;

  constructor(crowi: Crowi) {
    this.s2sMessagingService = crowi.s2sMessagingService;
    this.appService = crowi.appService;
  }

  /**
   * @inheritdoc
   */
  shouldHandleS2sMessage(s2sMessage) {
    const { eventName, updatedAt } = s2sMessage;
    if (eventName !== 'customizeServiceUpdated' || updatedAt == null) {
      return false;
    }

    return (
      this.lastLoadedAt == null ||
      this.lastLoadedAt < new Date(s2sMessage.updatedAt)
    );
  }

  /**
   * @inheritdoc
   */
  async handleS2sMessage(s2sMessage) {
    logger.info('Reset customized value by pubsub notification');
    await configManager.loadConfigs();
    this.initCustomCss();
    this.initCustomTitle();
    this.initGrowiTheme();
  }

  async publishUpdatedMessage() {
    const { s2sMessagingService } = this;

    if (s2sMessagingService != null) {
      const s2sMessage = new S2sMessage('customizeServiceUpdated', {
        updatedAt: new Date(),
      });

      try {
        await s2sMessagingService.publish(s2sMessage);
      } catch (e) {
        logger.error(
          'Failed to publish update message with S2sMessagingService: ',
          e.message,
        );
      }
    }
  }

  /**
   * initialize custom css strings
   */
  initCustomCss() {
    const rawCss = configManager.getConfig('customize:css') || '';

    this.customCss = rawCss;

    this.lastLoadedAt = new Date();
  }

  getCustomCss() {
    return this.customCss;
  }

  getCustomScript() {
    return configManager.getConfig('customize:script');
  }

  getCustomNoscript() {
    return configManager.getConfig('customize:noscript');
  }

  initCustomTitle() {
    let configValue = configManager.getConfig('customize:title');

    if (configValue == null || configValue.trim().length === 0) {
      configValue = '{{pagename}} - {{sitename}}';
    }

    this.customTitleTemplate = configValue;

    this.lastLoadedAt = new Date();
  }

  async initGrowiTheme(): Promise<void> {
    const theme = configManager.getConfig('customize:theme');

    this.theme = theme;

    const resultForThemePlugin =
      await growiPluginService.findThemePlugin(theme);

    if (resultForThemePlugin != null) {
      this.forcedColorScheme = getForcedColorScheme(
        resultForThemePlugin.themeMetadata.schemeType,
      );
      this.themeHref = resultForThemePlugin.themeHref;
    }
    // retrieve preset theme
    else {
      // Load the manifest once, here, and cache it for resolvePresetThemeAsset.
      this.presetThemesManifest = await import(
        path.join('@growi/preset-themes', manifestPath),
        { with: { type: 'json' } }
      ).then((imported) => imported.default);

      const configured = this.resolvePresetThemeAsset(theme);
      if (configured == null) {
        logger.warn(
          `Use default theme because '${theme}' is not a known preset theme`,
        );
      }
      const asset =
        configured ?? this.resolvePresetThemeAsset(DefaultThemeMetadata.name);
      this.themeHref = asset?.href;
      this.forcedColorScheme = asset?.forcedColorScheme;
    }
  }

  /**
   * Resolve a preset theme name to its served CSS href + forced color scheme,
   * or null for an unknown name (plugin themes included - those are only
   * resolvable as the instance default via findThemePlugin). Synchronous:
   * reads the manifest cached in initGrowiTheme(). Used both for the instance
   * default and for a viewer's per-browser `grw-theme` cookie override
   * (_document / common-props).
   */
  resolvePresetThemeAsset(
    themeName: string | undefined,
  ): { href: string; forcedColorScheme?: ColorScheme } | null {
    if (themeName == null || this.presetThemesManifest == null) {
      return null;
    }

    const metadata = PresetThemesMetadatas.find((p) => p.name === themeName);
    const entry =
      metadata != null ? this.presetThemesManifest[metadata.manifestKey] : null;
    if (metadata == null || entry == null) {
      return null;
    }

    return {
      href: `/static/preset-themes/${entry.file}`, // served by express.static
      forcedColorScheme: getForcedColorScheme(metadata.schemeType),
    };
  }
}
