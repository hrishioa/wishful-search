import {
  CommonLLMParameters,
  LLMCallFunc,
  LLMCompatibleMessage,
  LLMConfig,
} from './types';

interface MinimalOpenAIModule {
  chat: {
    completions: {
      create: (params: {
        messages: LLMCompatibleMessage[];
        model: string;
        temperature?: number;
      }) => Promise<{
        choices: { message: { content: string | null } }[];
      }>;
    };
  };
}

function getOpenAIAdapter(
  openai: MinimalOpenAIModule,
  params?: CommonLLMParameters,
) {
  const DEFAULT_OPENAI_PARAMS = {
    model: 'gpt-3.5-turbo',
    temperature: 0,
  };

  const DEFAULT_OPENAI_LLM_CONFIG: LLMConfig = {
    userStartsQuery: true,
    enableTodaysDate: true,
    fewShotLearning: [],
  };

  const adapter: {
    llmConfig: LLMConfig;
    callLLM: LLMCallFunc;
  } = {
    llmConfig: DEFAULT_OPENAI_LLM_CONFIG,
    callLLM: async function callLLM(messages: LLMCompatibleMessage[]) {
      const completion = await openai.chat.completions.create({
        messages,
        ...{ ...DEFAULT_OPENAI_PARAMS, ...(params || {}) },
      });

      return (
        (completion &&
          completion.choices &&
          completion.choices.length &&
          completion.choices[0] &&
          completion.choices[0].message.content) ||
        null
      );
    },
  };

  return adapter;
}

const adapters = {
  getOpenAIAdapter,
};

export default adapters;
