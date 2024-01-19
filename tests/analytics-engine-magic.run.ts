import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

import fs from 'fs';
import { LLMAdapters } from '../src/index';
import { question } from './test-utils';
import { MTGTables, MagicTheGatheringCard } from './magic-data';
import { WishfulBaseEngine } from '../src/analytics-engine';

const openai = new OpenAI();

const LMStudioOpenAI = new OpenAI({
  baseURL: 'http://localhost:1234/v1',
});

const LMStudio2OpenAI = new OpenAI({
  baseURL: 'http://localhost:1235/v1',
});

export const LMStudioYarnAdapter = LLMAdapters.getLMStudioAdapter(
  LMStudioOpenAI,
  'yarn-mistral',
  {
    temperature: 0.1,
    model: 'yarn-mistral',
  },
);

export const LMStudioDolphinAdapter = LLMAdapters.getLMStudioAdapter(
  LMStudio2OpenAI,
  'dolphin',
  {
    temperature: 0.1,
    model: 'dolphin',
  },
);

const ORIGINAL_CARDS = JSON.parse(
  fs.readFileSync(__dirname + '/data/AtomicCards_original2.json', 'utf8'),
);

const MAGIC_CARDS = Object.values(ORIGINAL_CARDS.data).map(
  (val) => (val as any[])[0],
) as MagicTheGatheringCard[];

// fs.writeFileSync(
//   __dirname + '/data/fAtomicCards.json',
//   JSON.stringify(MAGIC_CARDS, null, 2),
// );

console.log('Read ', MAGIC_CARDS.length, 'cards.');

const GPT4LLMAdapter = LLMAdapters.getOpenAIAdapter(openai, {
  model: 'gpt-4',
});

const anthropic = new Anthropic();
const ClaudeLLMAdapter = LLMAdapters.getClaudeAdapter(
  Anthropic.HUMAN_PROMPT,
  Anthropic.AI_PROMPT,
  anthropic,
  {
    model: 'claude-2',
  },
);

// console.log(
//   'Analyzing magic cards using card - ',
//   JSON.stringify(MAGIC_CARDS[75], null, 2),
//   '...',
// );

// autoAnalyzeObject(
//   MAGIC_CARDS[75],
//   ClaudeLLMAdapter.callLLM,
//   __dirname + '/data',
//   STRING_MTG_CARD_TYPESPEC,
// ).then(() => console.log('Done!'));

(async function run() {
  const baseEngine = new WishfulBaseEngine(
    MTGTables,
    {
      enableCurrentDate: true,
    },
    GPT4LLMAdapter.callLLM,
    {
      enableDynamicEnums: true,
      sortEnumsByFrequency: true,
    },
  );

  while (true) {
    const q = await question('\n\nWhat are you looking for? ');

    const messages = baseEngine.generatePrompt(q);

    console.log('Messages: ', messages);

    const query = await baseEngine.generateQuery(messages);

    console.log('Query: ', query);

    const reflectionMessages = baseEngine.getReflectionPrompt(
      {
        type: 'fullHistory',
        messages,
      },
      query,
      'This function doesnt exist',
    );

    console.log('Reflection Messages: ', reflectionMessages);

    const reflectionQuery = await baseEngine.generateQuery(reflectionMessages);

    console.log('Reflection Query: ', reflectionQuery);
  }
})().then(() => console.log('Done!'));
