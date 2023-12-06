import {
  DDLTable,
  RawResults,
  StatsColumnType,
  VALID_PRIMITIVE_TYPES,
} from './types';

export function addColumnTypes(
  results: RawResults,
  ddls: DDLTable[],
): RawResults {
  if (results && results.rawResults && results.rawResults.length) {
    results.rawResults = results.rawResults.map((result) => {
      if (result.columns && result.columns.length) {
        result.columnTypes = result.columns.map((column) => {
          return detectType(ddls, column);
        });
      }

      return result;
    });
  }

  return results;
}

export function detectType(ddls: DDLTable[], column: string): StatsColumnType {
  const matchingColumn = ddls
    .map((ddl) => ddl.columns.filter((col) => !!col.statsColumnType))
    .flat()
    .find((col) => col.name === column);

  if (matchingColumn) {
    return matchingColumn.statsColumnType!;
  }

  const matchingPrimitive = VALID_PRIMITIVE_TYPES.find((typeName) =>
    column.toLowerCase().startsWith(typeName),
  );

  if (matchingPrimitive) {
    return { type: matchingPrimitive };
  }

  if (column.toLowerCase().startsWith('currency')) {
    return {
      type: 'currency',
      code: column
        .slice('currency'.length, 'currency'.length + 3)
        .toUpperCase(),
    };
  }

  return {
    type: 'unknown',
  };
}

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
      columnTypes: resultSet.columnTypes,
      values: resultSet.values.slice(start, end),
      rowsPerPage: maxRows,
      page,
      totalRows: resultSet.values.length,
    };
  });

  return results;
}
