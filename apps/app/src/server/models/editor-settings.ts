import type { EditorSettings } from '@growi/editor';
import type { Document, Model } from 'mongoose';
import { Schema } from 'mongoose';

import { getOrCreateModel } from '../util/mongoose-utils';

export interface EditorSettingsDocument extends EditorSettings, Document {
  userId: Schema.Types.ObjectId;
}
export type EditorSettingsModel = Model<EditorSettingsDocument>;

const editorSettingsSchema = new Schema<
  EditorSettingsDocument,
  EditorSettingsModel
>({
  userId: { type: Schema.Types.ObjectId },
  theme: { type: String },
  keymapMode: { type: String },
  styleActiveLine: { type: Boolean, default: false },
  autoFormatMarkdownTable: { type: Boolean, default: true },
  defaultToWysiwyg: { type: Boolean, default: false },
});

export default getOrCreateModel<EditorSettingsDocument, EditorSettingsModel>(
  'EditorSettings',
  editorSettingsSchema,
);
