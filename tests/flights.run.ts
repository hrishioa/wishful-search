import { WishfulSearchEngine, LLMAdapters } from '../src/index';
import {
  // FLIGHTS_FEW_SHOT_LEARNING,
  Flight,
  TEST_FLIGHTS,
  TEST_FLIGHTS_DDL,
  flightToRows,
  stringifyFlight,
} from './data/flights-data';
// import { FLIGHTS_1, FLIGHTS_2, FLIGHTS_3 } from './data/larger-flights';
import fs from 'fs';
import { question } from './test-utils';

import OpenAI from 'openai';
const openai = new OpenAI();

// const LMStudioOpenAI = new OpenAI({
//   baseURL: 'http://localhost:1234/v1',
// });

// Uncomment if you want to use Claude
// import Anthropic from '@anthropic-ai/sdk';
// const anthropic = new Anthropic();

(async function () {
  console.log('Loading...');

  const GPT4LLMAdapter = LLMAdapters.getOpenAIAdapter(openai, {
    model: 'gpt-4',
  });


  // const LMStudioMistralAdapter = LLMAdapters.getLMStudioAdapter(
  //   LMStudioOpenAI,
  //   'dolphin',
  //   {
  //     temperature: 0.1,
  //     model: 'dolphin',
  //   },
  // );

  // const GPT3LLMAdapter = LLMAdapters.getOpenAIAdapter(openai, {
  //   model: 'gpt-3.5-turbo',
  // });

  // Uncomment to use either Claude model
  // const Claude2LLMAdapter = LLMAdapters.getClaudeAdapter(Anthropic.HUMAN_PROMPT, Anthropic.AI_PROMPT, anthropic, {
  //   model: 'claude-2'
  // })
  // const Claude1LLMAdapter = LLMAdapters.getClaudeAdapter(
  //   Anthropic.HUMAN_PROMPT,
  //   Anthropic.AI_PROMPT,
  //   anthropic,
  //   {
  //     model: 'claude-instant-v1',
  //   },
  // );

  // Uncomment to use Mistral - make sure Ollama is running and the api port is default
  // const MistralLLMAdapter = LLMAdapters.getMistralAdapter({
  //   model: 'mistral',
  // });

  const wishfulSearchEngine = await WishfulSearchEngine.create(
    'flights',
    TEST_FLIGHTS_DDL,
    {
      table: 'Flights',
      column: 'uid',
    },
    flightToRows,
    {
      enableTodaysDate: true,
      fewShotLearning: [],
      // fewShotLearning: FLIGHTS_FEW_SHOT_LEARNING,
    },
    GPT4LLMAdapter.callLLM,
    (flight: Flight) => flight.uid,
    true,
    true,
    true,
  );

  // const flights = TEST_FLIGHTS;
  const flights = JSON.parse(
    fs.readFileSync('./tests/data/flights-larger.json', 'utf8'),
  ) as Flight[];

  const errors = wishfulSearchEngine.insert(flights);
  console.log('Inserted ', TEST_FLIGHTS.length, 'flights. Errors: ', errors);

  // Uncomment for auto-fewshot generation. You can try using GPT4 to train 3,
  // Claude-2 to train 3.5, 4 to train mistral, or whatever you'd like.
  // await wishfulSearchEngine.autoGenerateFewShot(GPT4LLMAdapter.callLLM, [{
  //   question: 'something romantic?'
  // },{
  //   question: 'Same filters, instead now Comedy.'
  // }, {
  //   question: 'Whats the most popular one?',
  // }, {
  //   question: 'Is it from Warner Brothers? If not why show me it?'
  // }, {
  //   clearHistory: true,
  //   question: 'Something that has women or woman in the title.'
  // }, {
  //   question: 'With the highest revenue?',
  // }, {
  //   question: 'comedy ones please.'
  // }], true, false, true);

  // while(true) {
  //   const q = await question('\n\nWhat are you looking for? ');
  //   const results = await wishfulSearchEngine.search(q, true, true) as Flight[];
  //   console.log('\n\nRetrieved ', results.length, 'results.');
  //   if(results.length > 0 && results[0])
  //     console.log('Top result: ', stringifyFlight(results[0]));
  //   else
  //     console.log('No results found.');
  // }

  while (true) {
    const q = await question('\n\nWhat are you looking for? ');
    const results = await wishfulSearchEngine.autoSearch(
      q,
      stringifyFlight,
      4,
      0.85,
      GPT4LLMAdapter.callLLM,
      true,
      true,
    );
    console.log('\n\nRetrieved ', results.length, 'results.');
    if (results.length > 0 && results[0])
      console.log('Top result: ', stringifyFlight(results[0]));
    else console.log('No results found.');
  }
})();
