import type { HomeWidgetPreferences } from '~/features/home/interfaces/home-widgets';

import type { SidebarContentsType } from './ui';

export interface IUserUISettings {
  currentSidebarContents: SidebarContentsType;
  currentProductNavWidth: number;
  preferCollapsedModeByUser: boolean;
  // Last model the user picked in the Mastra AI chat, stored as a provider-qualified
  // modelKey (`${provider}/${modelId}`) so the selection uniquely identifies its owning
  // provider; used as the initial selection on next visit (Req 4.4).
  aiChatSelectedModelKey?: string;
  // Per-user, partial overrides of the `/home` widget area layout: for each
  // widget key the user may pin `visible` and/or `order`. Absent on users who
  // have never customised the layout; consumers treat `null | undefined` as an
  // empty override map (Req 6.2).
  homeWidgetPreferences?: HomeWidgetPreferences;
}
