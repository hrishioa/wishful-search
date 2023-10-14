/**
 * Really hastily written, forgive me for cleanliness.
 * Designed to take movies_metadata.csv from Kaggle (https://www.kaggle.com/datasets/rounakbanik/the-movies-dataset/)
 * and convert it to a nested JSON structure we can use.
 */

import * as fs from 'fs';
import { parse } from 'csv-parse';
import * as Hjson from 'hjson';

const jsonFields = [
  'production_companies',
  'spoken_languages',
  'production_countries',
  'genres',
];

const skipFields = [
  'belongs_to_collection',
  'homepage',
  'poster_path',
  'video',
];

export async function loadMovies() {
  const fileContent = fs.readFileSync(
    './tests/data/movies_metadata.csv',
    'utf8',
  );

  const records: any[] = await new Promise((resolve, reject) => {
    parse(
      fileContent,
      {
        columns: true,
        relax_column_count_less: true,
      },
      (err, records) => {
        if (err) reject(err);
        resolve(records);
      },
    );
  });

  const parsedRecords = records
    .map((record) => {
      for (const field of jsonFields) {
        try {
          record[field] = Hjson.parse(record[field]);
        } catch (err) {
          return null;
        }
      }

      for (const skipField of skipFields) {
        delete record[skipField];
      }

      return record;
    })
    .filter((record) => !!record);

  return parsedRecords;
}