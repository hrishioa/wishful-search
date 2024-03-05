import { LLMTemplateFunctions } from './llm-templates';
import { callOllama } from './ollama';
import {
  CommonLLMParameters,
  LLMCallFunc,
  LLMCompatibleMessage,
  LLMConfig,
} from './types';
import type OpenAI from 'openai';
import type Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources';
import type { OpenAIClient } from '@azure/openai';
import { TogetherAISupportedModel, callTogetherAI } from './togetherai';

export function getTogetherAIAdapter(
  params?: CommonLLMParameters & { model: TogetherAISupportedModel },
) {
  const DEFAULT_MIXTRAL_PARAMS = {
    model: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
    temperature: 0.5,
    max_tokens: 10000,
  };

  const DEFAULT_MIXTRAL_LLM_CONFIG: LLMConfig = {
    enableTodaysDate: true,
    fewShotLearning: [],
  };

  const adapter: {
    llmConfig: LLMConfig;
    callLLM: LLMCallFunc;
  } = {
    llmConfig: DEFAULT_MIXTRAL_LLM_CONFIG,
    callLLM: async function callLLM(
      messages: LLMCompatibleMessage[],
      queryPrefix?: string,
    ) {
      if (queryPrefix && messages[messages.length - 1]!.role !== 'assistant')
        messages.push({
          role: 'assistant',
          content: queryPrefix,
        });

      if (process.env.PRINT_WS_INTERNALS === 'yes')
        console.log(
          `Asking ${
            params?.model ?? DEFAULT_MIXTRAL_PARAMS.model
          } on TogetherAI...`,
        );

      const response = await callTogetherAI(
        messages,
        params?.model ??
          (DEFAULT_MIXTRAL_PARAMS.model as TogetherAISupportedModel),
        params?.temperature ?? (DEFAULT_MIXTRAL_PARAMS.temperature || 0),
        params?.max_tokens ?? (DEFAULT_MIXTRAL_PARAMS.max_tokens || 10000),
      );

      if (process.env.PRINT_WS_INTERNALS === 'yes')
        console.log('Streaming response: ');

      const startTime = process.hrtime();
      let tokens = 0;

      for await (const token of response) {
        if (token.type === 'token') {
          if (process.env.PRINT_WS_INTERNALS === 'yes')
            process.stdout.write(token.token);
          tokens += token.token.length;
        }
        if (token.type === 'error') {
          if (process.env.PRINT_WS_INTERNALS === 'yes')
            console.error(token.error);
        }
        if (token.type === 'completeMessage') {
          const endTime = process.hrtime(startTime);
          if (process.env.PRINT_WS_INTERNALS === 'yes')
            console.log(
              '\nCharacters per second: ',
              tokens / (endTime[0] + endTime[1] / 1e9),
            );
          return token.message;
        }
      }

      return null;
    },
  };

  return adapter;
}

export function getOllamaAdapter(params?: CommonLLMParameters) {
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
      queryPrefix?: string,
    ) {
      if (queryPrefix && messages[messages.length - 1]!.role !== 'assistant')
        messages.push({
          role: 'assistant',
          content: queryPrefix,
        });

      const { prompt, stopSequences } =
        LLMTemplateFunctions['mistral'](messages);

      if (process.env.PRINT_WS_INTERNALS === 'yes')
        console.log(
          `Asking ${
            params?.model ?? DEFAULT_MISTRAL_PARAMS.model
          } on Ollama...`,
        );

      const response = await callOllama(
        prompt,
        params?.model ?? DEFAULT_MISTRAL_PARAMS.model,
        11434,
        params?.temperature ?? DEFAULT_MISTRAL_PARAMS.temperature,
      );

      if (process.env.PRINT_WS_INTERNALS === 'yes')
        console.log('Streaming response: ');

      const startTime = process.hrtime();
      let tokens = 0;

      for await (const token of response) {
        if (token.type === 'completeMessage') {
          if (process.env.PRINT_WS_INTERNALS === 'yes')
            process.stdout.write(
              token.message.split(stopSequences[0]!)[0] ||
                '<NO TOKEN RECEIVED>',
            );
          tokens += token.message.length;
          return token.message.split(stopSequences[0]!)[0] || null;
        }
      }

      const endTime = process.hrtime(startTime);
      if (process.env.PRINT_WS_INTERNALS === 'yes')
        console.log(
          '\nCharacters per second: ',
          tokens / (endTime[0] + endTime[1] / 1e9),
        );

      return null;
    },
  };

  return adapter;
}

function getClaudeLegacyAdapter(
  humanPromptTag: string,
  assistantPromptTag: string,
  anthropic: Anthropic,
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
      queryPrefix?: string,
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
        prompt += `${assistantPromptTag}${
          queryPrefix ? ` ${queryPrefix}` : ''
        }`;
      try {
        if (process.env.PRINT_WS_INTERNALS === 'yes')
          console.log(
            `Asking ${
              params?.model ?? DEFAULT_CLAUDE_PARAMS.model
            } (Anthropic)...\n`,
          );

        const completion = await anthropic.completions.create({
          prompt,
          max_tokens_to_sample: 10000,
          ...{ ...DEFAULT_CLAUDE_PARAMS, ...(params || {}) },
          stream: true,
        });

        let fullMessage = '';

        if (process.env.PRINT_WS_INTERNALS === 'yes')
          console.log('Streaming response: ');

        const startTime = process.hrtime();
        let tokens = 0;

        for await (const part of completion) {
          if (process.env.PRINT_WS_INTERNALS === 'yes')
            process.stdout.write(part.completion || '');
          fullMessage += part.completion || '';
          if (part.completion) tokens += part.completion.length;
        }

        const endTime = process.hrtime(startTime);
        if (process.env.PRINT_WS_INTERNALS === 'yes')
          console.log(
            '\nCharacters per second: ',
            tokens / (endTime[0] + endTime[1] / 1e9),
          );

        return fullMessage || null;
      } catch (err) {
        console.error(`Error retrieving response from model ${params}`);
        console.error(err);
        return null;
      }
    },
  };

  return adapter;
}

function getClaudeAdapter(anthropic: Anthropic, params?: CommonLLMParameters) {
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
      queryPrefix?: string,
    ) {
      try {
        const formattedMessages = messages.filter(
          (message) => message.role !== 'system',
        ) as MessageParam[];

        if (process.env.PRINT_WS_INTERNALS === 'yes')
          console.log(
            `Asking ${
              params?.model ?? DEFAULT_CLAUDE_PARAMS.model
            } (Anthropic)...\n`,
          );

        const completion = await anthropic.messages.create({
          messages: formattedMessages,
          system: messages.find((message) => message.role === 'system')
            ?.content,
          max_tokens: 4096,
          ...{ ...DEFAULT_CLAUDE_PARAMS, ...(params || {}) },
          stream: true,
        });

        let fullMessage = '';

        if (process.env.PRINT_WS_INTERNALS === 'yes')
          console.log('Streaming response: ');

        const startTime = process.hrtime();
        let tokens = 0;

        for await (const part of completion) {
          if (part.type === 'content_block_start') {
            fullMessage += part.content_block.text || '';
            if (process.env.PRINT_WS_INTERNALS === 'yes')
              process.stdout.write(part.content_block.text || '');
          } else if (part.type === 'content_block_delta') {
            fullMessage += part.delta.text || '';

            if (process.env.PRINT_WS_INTERNALS === 'yes')
              process.stdout.write(part.delta.text || '');
          } else if (part.type === 'message_delta') {
            tokens += part.usage.output_tokens;
          }
        }

        const endTime = process.hrtime(startTime);
        if (process.env.PRINT_WS_INTERNALS === 'yes')
          console.log(
            '\nCharacters per second: ',
            tokens / (endTime[0] + endTime[1] / 1e9),
          );

        return fullMessage || null;
      } catch (err) {
        console.error(`Error retrieving response from model ${params}`);
        console.error(err);
        return null;
      }
    },
  };

  return adapter;
}

export type LocalModelParameters = CommonLLMParameters & {
  model: keyof typeof LLMTemplateFunctions;
};

export function getLMStudioAdapter(
  modifiedOpenAI: OpenAI,
  template: keyof typeof LLMTemplateFunctions,
  params?: LocalModelParameters,
) {
  const DEFAULT_PARAMS: LocalModelParameters = {
    model: 'mistral',
    temperature: 0,
  };

  const DEFAULT_LLM_CONFIG: LLMConfig = {
    enableTodaysDate: true,
    fewShotLearning: [],
  };

  const adapter: {
    llmConfig: LLMConfig;
    callLLM: LLMCallFunc;
  } = {
    llmConfig: DEFAULT_LLM_CONFIG,
    callLLM: async function callLLM(
      messages: LLMCompatibleMessage[],
      queryPrefix?: string,
    ) {
      if (queryPrefix && messages[messages.length - 1]!.role !== 'assistant')
        messages.push({
          role: 'assistant',
          content: queryPrefix,
        });

      const { prompt, stopSequences } =
        LLMTemplateFunctions[template](messages);

      try {
        if (process.env.PRINT_WS_INTERNALS === 'yes')
          console.log(
            `Asking ${
              params?.model ?? DEFAULT_PARAMS.model
            } on your machine (LMStudio)...`,
          );

        const completion = await modifiedOpenAI.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          ...{ ...DEFAULT_PARAMS, ...(params || {}) },
          stop: stopSequences,
          stream: true,
        });

        let fullMessage = '';

        if (process.env.PRINT_WS_INTERNALS === 'yes')
          console.log('Streaming response: ');

        const startTime = process.hrtime();
        let tokens = 0;

        for await (const part of completion) {
          if (process.env.PRINT_WS_INTERNALS === 'yes')
            process.stdout.write(part.choices[0]?.delta?.content || '');
          fullMessage += part.choices[0]?.delta?.content || '';
          if (part.choices[0]?.delta?.content)
            tokens += part.choices[0]?.delta?.content.length;
        }

        const endTime = process.hrtime(startTime);
        if (process.env.PRINT_WS_INTERNALS === 'yes')
          console.log(
            '\nCharacters per second: ',
            tokens / (endTime[0] + endTime[1] / 1e9),
          );

        return fullMessage || null;
      } catch (err) {
        console.error(`Error retrieving response from model ${params}`);
        console.error(err);
        return null;
      }
    },
  };

  return adapter;
}

function getOpenAIAdapter(openai: OpenAI, params?: CommonLLMParameters) {
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
      _?: string,
    ) {
      if (messages.length < 1 || !messages[messages.length - 1]) return null;

      if (messages[messages.length - 1]!.role === 'assistant') {
        const lastAssistantMessage = messages[messages.length - 1]!.content;
        messages = [...messages.slice(0, messages.length - 1)];
        messages[messages.length - 1]!.content = `${
          messages[messages.length - 1]!.content
        }\n\n${lastAssistantMessage}`;
      }

      try {
        if (process.env.PRINT_WS_INTERNALS === 'yes')
          console.log(
            `Asking ${
              params?.model ?? DEFAULT_OPENAI_PARAMS.model
            } (OpenAI)...`,
          );

        const completion = await openai.chat.completions.create({
          messages,
          ...{ ...DEFAULT_OPENAI_PARAMS, ...(params || {}) },
          stream: true,
        });

        let fullMessage = '';

        if (process.env.PRINT_WS_INTERNALS === 'yes')
          console.log('Streaming response: ');

        const startTime = process.hrtime();
        let tokens = 0;

        for await (const part of completion) {
          if (process.env.PRINT_WS_INTERNALS === 'yes')
            process.stdout.write(part.choices[0]?.delta?.content || '');
          fullMessage += part.choices[0]?.delta?.content || '';
          if (part.choices[0]?.delta?.content)
            tokens += part.choices[0]?.delta?.content.length;
        }

        const endTime = process.hrtime(startTime);
        if (process.env.PRINT_WS_INTERNALS === 'yes')
          console.log(
            '\nCharacters per second: ',
            tokens / (endTime[0] + endTime[1] / 1e9),
          );

        return fullMessage || null;
      } catch (err) {
        console.error(`Error retrieving response from model ${params}`);
        console.error(err);
        return null;
      }
    },
  };

  return adapter;
}

export function getAzureMistralAdapter(
  azureEndpoint: string,
  azureKey: string,
  params: CommonLLMParameters,
) {
  const DEFAULT_OPENAI_LLM_CONFIG: LLMConfig = {
    enableTodaysDate: true,
  };

  const adapter: {
    llmConfig: LLMConfig;
    callLLM: LLMCallFunc;
  } = {
    llmConfig: DEFAULT_OPENAI_LLM_CONFIG,
    callLLM: async function callLLM(
      messages: LLMCompatibleMessage[],
      _?: string,
    ) {
      if (messages.length < 1 || !messages[messages.length - 1]) return null;

      if (messages[messages.length - 1]!.role === 'assistant') {
        const lastAssistantMessage = messages[messages.length - 1]!.content;
        messages = [...messages.slice(0, messages.length - 1)];
        messages[messages.length - 1]!.content = `${
          messages[messages.length - 1]!.content
        }\n\n${lastAssistantMessage}`;
      }

      try {
        if (process.env.PRINT_WS_INTERNALS === 'yes')
          console.log(`Asking ${params.model} (Mistral Large Azure)...`);

        const response = await fetch(`${azureEndpoint}/v1/chat/completions`, {
          method: 'post',
          headers: {
            'User-Agent': 'mistral-client-js/0.0.3',
            Accept: 'text/event-stream',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${azureKey}`,
          },
          body: JSON.stringify({
            model: params.model,
            temperature: params.temperature || 0.1,
            messages,
            stream: true,
          }),
        });

        let fullMessage = '';

        if (process.env.PRINT_WS_INTERNALS === 'yes')
          console.log('Streaming response: ');

        const startTime = process.hrtime();
        let tokens = 0;

        if (!response.body)
          throw new Error('No response body from Mistral Large Azure');

        let buffer = '';
        const decoder = new TextDecoder();

        const reader = response.body.getReader();
        try {
          while (true) {
            // Read from the stream
            const { done, value } = await reader.read();
            // Exit if we're done
            if (done) break;
            // Else yield the chunk
            buffer += decoder.decode(value, { stream: true });

            let firstNewline;
            while ((firstNewline = buffer.indexOf('\n')) !== -1) {
              const chunkLine = buffer.substring(0, firstNewline);
              buffer = buffer.substring(firstNewline + 1);
              if (chunkLine.startsWith('data:')) {
                const json = chunkLine.substring(6).trim();
                if (json !== '[DONE]') {
                  const chunk = JSON.parse(json);

                  if (chunk && chunk.choices && chunk.choices.length) {
                    chunk.choices.forEach((choice: any) => {
                      if (choice.delta.content !== undefined) {
                        const streamText = choice.delta.content;
                        fullMessage += streamText;
                        tokens += streamText.length;
                        if (process.env.PRINT_WS_INTERNALS === 'yes')
                          process.stdout.write(streamText);
                      }
                    });
                  }
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        const endTime = process.hrtime(startTime);
        if (process.env.PRINT_WS_INTERNALS === 'yes')
          console.log(
            '\nCharacters per second: ',
            tokens / (endTime[0] + endTime[1] / 1e9),
          );

        return fullMessage.replace(/\\_/g, '_') || null;
      } catch (err) {
        console.error(`Error retrieving response from model ${params}`);
        console.error(err);
        return null;
      }
    },
  };

  return adapter;
}

function getAzureOpenAIAdapter(
  azureOpenAI: OpenAIClient,
  params: CommonLLMParameters,
) {
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
      _?: string,
    ) {
      if (messages.length < 1 || !messages[messages.length - 1]) return null;

      if (messages[messages.length - 1]!.role === 'assistant') {
        const lastAssistantMessage = messages[messages.length - 1]!.content;
        messages = [...messages.slice(0, messages.length - 1)];
        messages[messages.length - 1]!.content = `${
          messages[messages.length - 1]!.content
        }\n\n${lastAssistantMessage}`;
      }

      try {
        if (process.env.PRINT_WS_INTERNALS === 'yes')
          console.log(`Asking ${params.model} (Azure OpenAI)...`);

        const streamingResults = await azureOpenAI.streamChatCompletions(
          params.model,
          messages,
          {
            maxTokens: params.max_tokens,
            temperature: params.temperature,
          },
        );

        let fullMessage = '';

        if (process.env.PRINT_WS_INTERNALS === 'yes')
          console.log('Streaming response: ');

        const startTime = process.hrtime();
        let tokens = 0;

        for await (const event of streamingResults) {
          for (const choice of event.choices) {
            const chunk = choice.delta?.content || '';

            if (process.env.PRINT_WS_INTERNALS === 'yes')
              process.stdout.write(chunk);

            fullMessage += chunk;

            if (chunk) tokens += chunk.length;
          }
        }

        const endTime = process.hrtime(startTime);
        if (process.env.PRINT_WS_INTERNALS === 'yes')
          console.log(
            '\nCharacters per second: ',
            tokens / (endTime[0] + endTime[1] / 1e9),
          );

        return fullMessage || null;
      } catch (err) {
        console.error(`Error retrieving response from model ${params}`);
        console.error(err);
        return null;
      }
    },
  };

  return adapter;
}

const adapters = {
  getOpenAIAdapter,
  getClaudeAdapter,
  getClaudeLegacyAdapter,
  getOllamaAdapter,
  getLMStudioAdapter,
  getTogetherAIAdapter,
  getAzureOpenAIAdapter,
  getAzureMistralAdapter,
};

export default adapters;
