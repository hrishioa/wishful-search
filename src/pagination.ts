import { RawResults } from './types';

export function paginateRawResults(
  results: RawResults['rawResults'],
  maxRows: number = 200,
  page: number = 1,
): RawResults['rawResults'] {
  results = results.map((resultSet: RawResults['rawResults'][0]) => {
    const start = (page - 1) * maxRows;
    const end = Math.min(resultSet.values.length, start + maxRows);

    return {
      columns: resultSet.columns,
      values: resultSet.values.slice(start, end),
      rowsPerPage: maxRows,
      page,
      totalRows: resultSet.values.length,
    };
  });

  return results;
}
