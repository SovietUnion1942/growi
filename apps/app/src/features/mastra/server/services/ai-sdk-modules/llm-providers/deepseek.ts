import type { MastraModelConfig } from '@mastra/core/llm';

import { requireApiKey } from './config';

export const resolveDeepseekModel = async (
  modelId: string,
): Promise<MastraModelConfig> => {
  const apiKey = requireApiKey('deepseek');
  const { createDeepSeek } = await import('@ai-sdk/deepseek');
  return createDeepSeek({ apiKey })(modelId);
};
