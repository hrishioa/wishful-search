import { callOllama } from './ollama';
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

export function getMistralAdapter(params?: CommonLLMParameters) {
  function generateMistralPrompt(messages: LLMCompatibleMessage[]) {
    `<s>[INST] {{ user_msg_1 }} [/INST] {{ model_answer_1 }}</s> [INST] {{ user_msg_2 }} [/INST] {{ model_answer_2 }}</s>`;

    const prompt = messages
      .map((message, index) =>
        message.role === 'assistant'
          ? `${message.content}${index < messages.length - 1 ? `</s>` : ''}`
          : `${
              index > 0 && messages[index - 1]!.role !== 'assistant'
                ? ''
                : '<s>'
            }[INST] ${
              message.role === 'system'
                ? `<system>${message.content}</system>`
                : message.content
            } [/INST]`,
      )
      .join(' ');

    return prompt;
  }

  const DEFAULT_MISTRAL_PARAMS = {
    model: 'mistral',
    temperature: 0,
  };

  const DEFAULT_MISTRAL_LLM_CONFIG: LLMConfig = {
    enableTodaysDate: true,
    fewShotLearning: [],
  };

  const adapter: {
    llmConfig: LLMConfig;
    callLLM: LLMCallFunc;
  } = {
    llmConfig: DEFAULT_MISTRAL_LLM_CONFIG,
    callLLM: async function callLLM(
      messages: LLMCompatibleMessage[],
      queryPrefix: string,
    ) {
      if (messages[messages.length - 1]!.role !== 'assistant')
        messages.push({
          role: 'assistant',
          content: queryPrefix,
        });

      const prompt = generateMistralPrompt(messages);

      console.log('Prompt - ', prompt);

      const response = await callOllama(
        prompt,
        params?.model ?? DEFAULT_MISTRAL_PARAMS.model,
        11434,
        params?.temperature ?? DEFAULT_MISTRAL_PARAMS.temperature,
      );

      console.log('Output:\n\n');
      for await (const token of response) {
        if (token.type === 'token') process.stdout.write(token.token);

        if (token.type === 'completeMessage') {
          console.log('\n\n');
          return token.message.split('</s>')[0] || null;
        }
      }

      return null;
    },
  };

  return adapter;
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
    enableTodaysDate: true,
    fewShotLearning: [],
  };

  const adapter: {
    llmConfig: LLMConfig;
    callLLM: LLMCallFunc;
  } = {
    llmConfig: DEFAULT_CLAUDE_LLM_CONFIG,
    callLLM: async function callLLM(
      messages: LLMCompatibleMessage[],
      queryPrefix: string,
    ) {
      let prompt = messages
        .map((message) =>
          message.role === 'user'
            ? `${humanPromptTag} ${message.content}`
            : message.role === 'assistant'
            ? `${assistantPromptTag} ${message.content}`
            : `${humanPromptTag} <system>${message.content}</system>`,
        )
        .join('');

      if (messages[messages.length - 1]!.role !== 'assistant')
        prompt += `${assistantPromptTag} ${queryPrefix}`;

      console.log('Prompt - ', prompt);

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
    enableTodaysDate: true,
    fewShotLearning: [],
  };

  const adapter: {
    llmConfig: LLMConfig;
    callLLM: LLMCallFunc;
  } = {
    llmConfig: DEFAULT_OPENAI_LLM_CONFIG,
    callLLM: async function callLLM(
      messages: LLMCompatibleMessage[],
      _: string,
    ) {
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
  getMistralAdapter,
};

export default adapters;
