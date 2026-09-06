import type { IUser, Ref } from '@growi/core';
import type { Document, Model } from 'mongoose';
import { Schema } from 'mongoose';

import { WIDGET_KEYS } from '~/features/home/interfaces/home-widgets';
import { SidebarContentsType } from '~/interfaces/ui';
import type { IUserUISettings } from '~/interfaces/user-ui-settings';

import { getOrCreateModel } from '../util/mongoose-utils';

// One widget's partial preference: the user may pin visibility, order, both or
// neither. `_id: false` keeps these as plain embedded objects.
const widgetPreferenceSchema = new Schema(
  {
    visible: { type: Boolean },
    order: { type: Number },
  },
  { _id: false },
);

// Explicit per-widget map (keys enumerated from WIDGET_KEYS, not Mixed) so the
// persisted shape stays in sync with the closed WidgetKey set.
const homeWidgetPreferencesSchema = new Schema(
  Object.fromEntries(
    WIDGET_KEYS.map((key) => [key, { type: widgetPreferenceSchema }]),
  ),
  { _id: false },
);

export interface UserUISettingsDocument extends IUserUISettings, Document {
  user: Ref<IUser>;
}
export type UserUISettingsModel = Model<UserUISettingsDocument>;

const schema = new Schema<UserUISettingsDocument, UserUISettingsModel>({
  user: { type: Schema.Types.ObjectId, ref: 'User', unique: true },
  currentSidebarContents: {
    type: String,
    enum: SidebarContentsType,
    default: SidebarContentsType.RECENT,
  },
  currentProductNavWidth: { type: Number },
  preferCollapsedModeByUser: { type: Boolean, default: false },
  aiChatSelectedModelKey: { type: String },
  homeWidgetPreferences: { type: homeWidgetPreferencesSchema },
});

export default getOrCreateModel<UserUISettingsDocument, UserUISettingsModel>(
  'UserUISettings',
  schema,
);
