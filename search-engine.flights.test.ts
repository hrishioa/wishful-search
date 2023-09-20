import {
  FLIGHTS_FEW_SHOT_LEARNING,
  Flight,
  TEST_FLIGHTS,
  TEST_FLIGHTS_DDL,
  flightToRows,
} from './data/flight-data';
import { getOpenAIAdapter } from './llm-adapters';
import { WishfulSearchEngine } from './search-engine';

import OpenAI from 'openai';

const openai = new OpenAI();

(async () => {
  const LLMAdapter = getOpenAIAdapter(openai, {
    model: 'gpt-4',
  });

  const wishfulSearchEngine = await WishfulSearchEngine.create(
    'flights',
    TEST_FLIGHTS_DDL,
    {
      table: 'Flights',
      column: 'uid',
    },
    flightToRows,
    {
      userStartsQuery: true,
      enableTodaysDate: true,
      // fewShotLearning: FLIGHTS_FEW_SHOT_LEARNING,
      fewShotLearning: [],
    },
    LLMAdapter.callLLM,
    (flight: Flight) => flight.uid,
    true,
    true,
    true,
  );

  console.log('Started engine.');

  const errors = wishfulSearchEngine.insert(TEST_FLIGHTS);

  console.log('Errors: ', errors);

  console.log('Inserted ', TEST_FLIGHTS.length, 'flights.');

  const question = 'Just economy flights.';

  console.log('Searching - ', question);

  const messages = wishfulSearchEngine.generateSearchMessages(question);

  console.log('Got messages - ', JSON.stringify(messages, null, 2));

  console.log('Searching...');

  const result = await wishfulSearchEngine.search(question);
})();
