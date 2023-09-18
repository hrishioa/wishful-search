import {
  FLIGHTS_FEW_SHOT_LEARNING,
  TEST_FLIGHTS,
  TEST_FLIGHTS_DDL,
  flightToRows,
} from './data/flight-data';
import { WishfulSearchEngine } from './search-engine';

(async () => {
  const wishfulSearchEngine = await WishfulSearchEngine.create(
    'flights',
    TEST_FLIGHTS_DDL,
    {
      table: 'Flights',
      column: 'uid',
    },
    flightToRows,
    {
      userStartsQuery: false,
      enableTodaysDate: true,
      fewShotLearning: FLIGHTS_FEW_SHOT_LEARNING,
    },
    true,
    true,
  );

  console.log('Started engine.');

  const errors = wishfulSearchEngine.index(TEST_FLIGHTS);

  console.log('Errors: ', errors);

  console.log('Inserted ', TEST_FLIGHTS.length, 'flights.');

  const question = 'what are the longest flights landing before 8 pm?';

  console.log('Searching - ', question);

  const messages = wishfulSearchEngine.generateSearchMessages(question);

  console.log('Got messages - ', JSON.stringify(messages, null, 2));
})();
