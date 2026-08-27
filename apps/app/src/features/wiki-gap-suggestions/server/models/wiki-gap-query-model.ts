import type { Document, Model } from 'mongoose';
import { Schema } from 'mongoose';

import { getOrCreateModel } from '~/server/util/mongoose-utils';

// Aggregate, asker-less record of a search query the AI agent's
// fullTextSearchTool found zero wiki pages for. Deliberately carries no
// reference to who asked -- only the normalized query text, an example of
// how it was actually typed, a running count, and first/last-seen
// timestamps. See project memory `search-failure-log-feature` for why this
// stays aggregate-only.
export interface WikiGapQueryDocument extends Document {
  normalizedQuery: string;
  rawQueryExample: string;
  count: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface WikiGapQueryModel extends Model<WikiGapQueryDocument> {}

const schema = new Schema<WikiGapQueryDocument, WikiGapQueryModel>({
  normalizedQuery: { type: String, required: true, unique: true },
  rawQueryExample: { type: String, required: true },
  count: { type: Number, required: true, default: 0 },
  firstSeenAt: { type: Date, required: true },
  lastSeenAt: { type: Date, required: true },
});

export default getOrCreateModel<WikiGapQueryDocument, WikiGapQueryModel>(
  'WikiGapQuery',
  schema,
);
