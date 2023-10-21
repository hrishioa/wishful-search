import { WishfulSearchEngine, LLMAdapters } from '../src/index';
import { MOVIES_DDL, MOVIES_FEW_SHOT, Movie, getMovies, movieToRows } from './movies-data';
import { question } from './test-utils';

import OpenAI from 'openai';
const openai = new OpenAI();

// Uncomment if you want to use Claude
// import Anthropic from '@anthropic-ai/sdk';
// const anthropic = new Anthropic();

(async function() {
  console.log('Loading...');

  // const GPT4LLMAdapter = LLMAdapters.getOpenAIAdapter(openai, {
  //   model: 'gpt-4',
  // });

  const GPT3LLMAdapter = LLMAdapters.getOpenAIAdapter(openai, {
    model: 'gpt-3.5-turbo',
  });

  // Uncomment to use either Claude model
  // const Claude2LLMAdapter = LLMAdapters.getClaudeAdapter(Anthropic.HUMAN_PROMPT, Anthropic.AI_PROMPT, anthropic, {
  //   model: 'claude-2'
  // })
  // const Claude1LLMAdapter = LLMAdapters.getClaudeAdapter(Anthropic.HUMAN_PROMPT, Anthropic.AI_PROMPT, anthropic, {
  //   model: 'claude-instant-v1'
  // })

  // Uncomment to use Mistral - make sure Ollama is running and the api port is default
  // const MistralLLMAdapter = LLMAdapters.getMistralAdapter({
  //   model: 'mistral'
  // });

  const wishfulSearchEngine = await WishfulSearchEngine.create(
    'flights',
    MOVIES_DDL,
    {
      table: 'Movies',
      column: 'id',
    },
    movieToRows,
    {
      enableTodaysDate: true,
      fewShotLearning: MOVIES_FEW_SHOT,
    },
    GPT3LLMAdapter.callLLM,
    (movie: Movie) => movie.id,
    true,
    true,
    true,
  );

  const TEST_MOVIES = await getMovies();

  const errors = wishfulSearchEngine.insert(TEST_MOVIES);
  console.log('Inserted ', TEST_MOVIES.length, 'movies. Errors: ', errors);

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

  while(true) {
    const q = await question('\n\nWhat are you looking for? ');
    const result = await wishfulSearchEngine.search(q, true, true) as Movie[];
    console.log('\n\nRetrieved ', result.length, 'results.');
    console.log('Top result: ', result[0]);
  }
})();