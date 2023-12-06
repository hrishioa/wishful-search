import { RawResults } from './types';

export function paginateRawResults(
  results: RawResults['rawResults'],
  maxRows: number = 200,
  page: number = 1,
): RawResults['rawResults'] {
  const start = (page - 1) * maxRows;
  const end = Math.min(results.length, start + maxRows);

  results = results.map((resultSet: RawResults['rawResults'][0]) => {
    return {
      columns: resultSet.columns,
      values: resultSet.values.slice(start, end),
      page,
      totalRows: results.length,
    };
  });

  return results;
}
