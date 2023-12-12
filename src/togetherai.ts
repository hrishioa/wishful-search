import { generateMistralPrompt } from './llm-templates';
import { LLMCompatibleMessage } from './types';

export type TogetherAISupportedModel = 'mistralai/Mixtral-8x7B-Instruct-v0.1';

export const TogetherAITemplates: {
  [key in TogetherAISupportedModel]: (messages: LLMCompatibleMessage[]) => {
    prompt: string;
    stopSequences: string[];
  };
} = {
  'mistralai/Mixtral-8x7B-Instruct-v0.1': generateMistralPrompt,
};

export async function* callTogetherAI(
  messages: LLMCompatibleMessage[],
  model: TogetherAISupportedModel,
  temperature: number = 0.5,
  maxTokens: number = 10000,
): AsyncGenerator<
  | {
      type: 'token';
      token: string;
    }
  | {
      type: 'completeMessage';
      message: string;
    }
  | {
      type: 'error';
      error: string;
    }
> {
  if (!process.env.TOGETHERAI_API_KEY) {
    throw new Error('TOGETHERAI_API_KEY is not set');
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.TOGETHERAI_API_KEY}`,
  };

  const { prompt, stopSequences } = TogetherAITemplates[model](messages);

  const requestBody = {
    model: model,
    prompt,
    stop: stopSequences[0],
    temperature,
    max_tokens: maxTokens,
    stream_tokens: true,
  };

  const response = await fetch('https://api.together.xyz/inference', {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });

  if (response.status !== 200 || !response.body) {
    console.error('TogetherAI returned status code', response);
    yield {
      type: 'error',
      error: `TogetherAI returned status code ${response.status}`,
    };
    return;
  }

  const reader = response.body.getReader();

  let fullMessage = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = new TextDecoder('utf-8').decode(value);
      const lines = chunk.split('\n');

      let incompleteLine = '';

      for (let line of lines) {
        try {
          line = incompleteLine + line;
          if (line.includes('[DONE]')) break;
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(5));
            if (
              data &&
              data.choices &&
              data.choices.length &&
              data.choices[0].text
            ) {
              yield {
                type: 'token',
                token: data.choices[0].text.replace('\\_', '_'),
              };
              fullMessage += data.choices[0].text.replace('\\_', '_');
            }
          }
        } catch (err) {
          if (incompleteLine) {
            console.error(
              'Error parsing message - ',
              line,
              '\n error is ',
              err,
            );

            yield {
              type: 'error',
              error: (err as Error).message,
            };
          } else {
            incompleteLine = line;
          }
        }
      }
    }
  } catch (err) {
    yield {
      type: 'error',
      error: (err as Error).message,
    };
  } finally {
    reader.releaseLock();
    yield {
      type: 'completeMessage',
      message: fullMessage,
    };
  }
}
