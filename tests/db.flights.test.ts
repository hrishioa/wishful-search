import { LLMSearcheableDatabase } from '../src/db';
import { generateSQLDDL } from '../src/structured-ddl';
import {
  Flight,
  TEST_FLIGHTS,
  TEST_FLIGHTS_DDL,
  flightToRows,
} from './data/flight-data';

(async () => {
  const db = await LLMSearcheableDatabase.create<Flight>(
    generateSQLDDL(TEST_FLIGHTS_DDL, true),
    'testdb',
    {
      table: 'Flights',
      column: 'uid',
    },
    flightToRows,
  );

  console.log('Inserting ', TEST_FLIGHTS.length);

  const errors = db.insert(TEST_FLIGHTS);

  console.log('Errors: ', errors);

  console.log('Getting all - ');

  const all = db.rawQueryKeys({ table: 'Flights', column: 'uid' }, '1=1');

  console.log('Got ', all.length, ' keys. Heres 10: ', all.slice(0, 10));

  const keyToDelete = all[(Math.random() * all.length) | 0];

  console.log('Deleting - ', keyToDelete);

  db.delete([keyToDelete]);

  const all2 = db.rawQueryKeys({ table: 'Flights', column: 'uid' }, '1=1');

  console.log('Getting all - there are now ', all2.length, ' keys.');

  for (const table of TEST_FLIGHTS_DDL) {
    for (const column of table.columns) {
      console.log('Enums for ', column.name, ' in ', table.name, ':');
      console.log(
        db.getEnums(
          {
            table: table.name,
            column: column.name,
          },
          true,
        ),
      );
    }
  }
})();
