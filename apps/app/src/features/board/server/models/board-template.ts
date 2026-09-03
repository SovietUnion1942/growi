import type { Document, Model, Types } from 'mongoose';
import { Schema } from 'mongoose';

import { getOrCreateModel } from '~/server/util/mongoose-utils';

import {
  BOARD_TEMPLATE_DESCRIPTION_MAX,
  BOARD_TEMPLATE_NAME_MAX,
} from '../../interfaces/board-template';

/**
 * A saved `tldraw` `TLContent` snapshot, reusable across boards. Shared
 * club-wide; `createdBy` only drives the "delete your own" affordance.
 */
export interface BoardTemplateDocument extends Document {
  name: string;
  description: string;
  content: unknown;
  thumbnail: string | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface BoardTemplateModel extends Model<BoardTemplateDocument> {}

const schema = new Schema<BoardTemplateDocument, BoardTemplateModel>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: BOARD_TEMPLATE_NAME_MAX,
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: BOARD_TEMPLATE_DESCRIPTION_MAX,
    },
    // the tldraw TLContent object -- opaque to the server
    content: { type: Schema.Types.Mixed, required: true },
    thumbnail: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

schema.index({ createdAt: -1 });

export default getOrCreateModel<BoardTemplateDocument, BoardTemplateModel>(
  'BoardTemplate',
  schema,
);
