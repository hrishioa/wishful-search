import { LLMCompatibleMessage } from './types';

export const LLMTemplateFunctions = {
  mistral: generateMistralPrompt,
  dolphin: generateDolphinPrompt,
};

function generateMistralPrompt(messages: LLMCompatibleMessage[]): {
  prompt: string;
  stopSequences: string[];
} {
  const prompt = messages
    .map((message, index) =>
      message.role === 'assistant'
        ? `${message.content}${index < messages.length - 1 ? `</s>` : ''}`
        : `${
            index > 0 && messages[index - 1]!.role !== 'assistant' ? '' : '<s>'
          }[INST] ${
            message.role === 'system'
              ? `<system>${message.content}</system>`
              : message.content
          } [/INST]`,
    )
    .join(' ');

  return {
    prompt,
    stopSequences: ['</s>', '<s>'],
  };
}

function generateDolphinPrompt(messages: LLMCompatibleMessage[]): {
  prompt: string;
  stopSequences: string[];
} {
  let prompt = messages
    .map((message, index) => {
      if (message.role === 'system')
        return `<|im_start|>system\n${message.content}<|im_end|>`;
      else if (message.role === 'user')
        return `<|im_start|>user\n${message.content}<|im_end|>`;
      else
        return `<|im_start|>assistant\n${message.content}${
          index < messages.length - 1 ? `<|im_end|>` : ''
        }`;
    })
    .join('\n');

  if (messages[messages.length - 1]!.role !== 'assistant')
    prompt += '\n<|im_start|>assistant';

  return {
    prompt,
    stopSequences: ['<|im_end|>', '<|im_start|>'],
  };
}
