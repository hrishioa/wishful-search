import { Database } from 'sql.js';

export function getEnumsForColumnFromSqlite(
  db: Database,
  table: string,
  column: string,
  sortByFrequency: boolean = false,
) {
  const query = sortByFrequency
    ? `SELECT ${column}, COUNT(${column}) as frequency
FROM ${table}
GROUP BY ${column}
ORDER BY frequency DESC;`
    : `SELECT DISTINCT ${column} FROM ${table}`;

  const result = db.exec(query);

  if (!result.length || !result[0]) return [];

  const enums = sortByFrequency
    ? (result[0].values.map((val) => val[0]) as string[])
    : (result[0].values.flat() as string[]);

  return enums;
}
