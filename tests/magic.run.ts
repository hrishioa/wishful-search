import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

import fs from 'fs';
import {
  WishfulSearchEngine,
  LLMAdapters,
  autoAnalyzeObject,
} from '../src/index';
import { question } from './test-utils';
import {
  MTGTables,
  MagicTheGatheringCard,
  STRING_MTG_CARD_TYPESPEC,
  cardToRows,
  cardToString,
} from './magic-data';

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
  const wishfulSearchEngine = await WishfulSearchEngine.create(
    'magic-the-gathering-cards',
    MTGTables,
    {
      table: 'Cards',
      column: 'id',
    },
    cardToRows,
    {
      enableTodaysDate: true,
      fewShotLearning: [],
    },
    // ClaudeLLMAdapter.callLLM,
    // GPT4LLMAdapter.callLLM,
    GPT4LLMAdapter.callLLM,
    (card: MagicTheGatheringCard) => card.name,
    true,
    true,
    true,
  );

  console.log('Inserting ', MAGIC_CARDS.length, 'magic cards...');

  const errors = await wishfulSearchEngine.insert(MAGIC_CARDS, true);

  console.log('Error count: ', errors.length);

  console.log('Generating Fewshot...');
  await wishfulSearchEngine.autoGenerateFewShot(
    GPT4LLMAdapter.callLLM,
    [
      {
        question:
          'I need a list of all the green sorcery cards that allow you to put extra lands onto the battlefield during your turn.',
      },
      {
        question:
          'Find all the legendary creatures that cost less than four mana of any type.',
        clearHistory: true,
      },
      {
        question:
          'Which red cards can deal damage to multiple creatures at once?',
        clearHistory: true,
      },
    ],
    true,
    false,
    true,
  );

  while (true) {
    const q = await question('\n\nWhat are you looking for? ');

    const results = (await wishfulSearchEngine.autoSearch(
      q,
      cardToString,
      4,
      0.8,
      GPT4LLMAdapter.callLLM,
      true,
      true,
    )) as MagicTheGatheringCard[];

    // const results = (await wishfulSearchEngine.search(
    //   q,
    //   true,
    //   true,
    // )) as MagicTheGatheringCard[];

    if (results.length)
      console.log('Top Result: \n', cardToString(results[0]!));

    console.log('\n\nRetrieved ', results.length, 'results.');
  }
})().then(() => console.log('Done!'));
