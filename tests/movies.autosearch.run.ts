import { WishfulSearchEngine, LLMAdapters } from '../src/index';
import { MOVIES_DDL, MOVIES_FEW_SHOT, Movie, getMovies, movieToRows, stringifyMovie } from './movies-data';

import OpenAI from 'openai';
import { question } from './test-utils';
const openai = new OpenAI();

// Uncomment if you want to use Claude
// import Anthropic from '@anthropic-ai/sdk';
// const anthropic = new Anthropic();

(async function() {
  console.log('Loading...');

  const GPT4LLMAdapter = LLMAdapters.getOpenAIAdapter(openai, {
    model: 'gpt-4',
  });

  // const GPT3LLMAdapter = LLMAdapters.getOpenAIAdapter(openai, {
  //   model: 'gpt-3.5-turbo',
  // });

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

  // const models = {
  //   'GPT-4': GPT4LLMAdapter,
  //   'GPT-3.5': GPT3LLMAdapter,
  //   'Claude-2': Claude2LLMAdapter,
  //   'Claude-1': Claude1LLMAdapter,
  //   'Mistral': MistralLLMAdapter,
  // };

  const wishfulSearchEngine = await WishfulSearchEngine.create(
    'movies',
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
    GPT4LLMAdapter.callLLM,
    (movie: Movie) => movie.id,
    true,
    true,
    true,
  );

  const TEST_MOVIES = await getMovies();

  const errors = wishfulSearchEngine.insert(TEST_MOVIES);
  console.log('Inserted ', TEST_MOVIES.length, 'movies. Errors: ', errors);

  while(true) {
    const q = await question('\n\nWhat are you looking for? ');
    const result = await wishfulSearchEngine.autoSearch(q, stringifyMovie, 4, 0.85, GPT4LLMAdapter.callLLM, true, true);
    console.log('\n\nRetrieved ', result.length, 'results.');
    console.log('Top result: ', result[0]);
  }
})();
