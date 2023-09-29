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

interface MinimalAnthropicModule {
  completions: {
    create: (params: {
      prompt: string;
      model: string;
      max_tokens_to_sample: number;
      temperature?: number;
    }) => Promise<{
      completion: string;
    }>;
  };
}

function getClaudeAdapter(
  humanPromptTag: string,
  assistantPromptTag: string,
  anthropic: MinimalAnthropicModule,
  params?: CommonLLMParameters,
) {
  const DEFAULT_CLAUDE_PARAMS = {
    model: 'claude-2',
    temperature: 0,
  };

  const DEFAULT_CLAUDE_LLM_CONFIG: LLMConfig = {
    userStartsQuery: false,
    enableTodaysDate: true,
    fewShotLearning: [],
  };

  const adapter: {
    llmConfig: LLMConfig;
    callLLM: LLMCallFunc;
  } = {
    llmConfig: DEFAULT_CLAUDE_LLM_CONFIG,
    callLLM: async function callLLM(messages: LLMCompatibleMessage[]) {
      const prompt = messages
        .map((message) =>
          message.role === 'user'
            ? `${humanPromptTag}: ${message.content}`
            : message.role === 'assistant'
            ? `${assistantPromptTag}: ${message.content}`
            : `${humanPromptTag}: <system>${message.content}</system>`,
        )
        .join('\n\n');

      const completion = await anthropic.completions.create({
        prompt,
        max_tokens_to_sample: 10000,
        ...{ ...DEFAULT_CLAUDE_PARAMS, ...(params || {}) },
      });

      return completion.completion || null;
    },
  };

  return adapter;
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
      if (messages.length < 1 || !messages[messages.length - 1]) return null;

      if (messages[messages.length - 1]!.role === 'assistant') {
        console.log('Last message is from assistant, rewriting...');

        const lastAssistantMessage = messages[messages.length - 1]!.content;
        messages = [...messages.slice(0, messages.length - 1)];
        messages[messages.length - 1]!.content = `${
          messages[messages.length - 1]!.content
        }\n\n${lastAssistantMessage}`;

        console.log('Messages is now ', messages);
      }

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
  getClaudeAdapter,
};

export default adapters;
