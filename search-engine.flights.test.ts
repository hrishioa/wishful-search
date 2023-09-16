import {
  TEST_FLIGHTS,
  TEST_FLIGHTS_DDL,
  flightToRows,
} from './data/flight-data';
import { WishfulSearchEngine } from './search-engine';

(async () => {
  const wishfulSearchEngine = new WishfulSearchEngine(
    'flights',
    TEST_FLIGHTS_DDL,
    {
      table: 'Flights',
      column: 'uid',
    },
    flightToRows,
    true,
    true,
  );

  console.log('Started engine.');

  const errors = await wishfulSearchEngine.index(TEST_FLIGHTS);

  console.log('Errors: ', errors);

  console.log('Inserted ', TEST_FLIGHTS.length, 'flights.');
})();
