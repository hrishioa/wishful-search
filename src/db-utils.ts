import { Database } from 'sql.js';
import { generateSQLDDL } from './structured-ddl';
import { addColumnTypes } from './analytics-utils';
import { DDLTable } from './types';

export function updateDDLWithDynamicEnums(
  inputDDL: DDLTable[],
  db: Database,
): DDLTable[] {
  const tables = JSON.parse(JSON.stringify(inputDDL)) as DDLTable[];

  for (const table of tables) {
    for (const column of table.columns.filter(
      (column) => column.dynamicEnumSettings !== undefined,
    )) {
      const enums = getEnumsForColumnFromSqlite(
        db,
        table.name,
        column.name,
        true,
      );

      let enumSettings = column.dynamicEnumSettings!;

      let dateParseFailed = false;

      if (enumSettings.type === 'MIN_MAX' && enumSettings.format === 'DATE') {
        const numericEnums = enums
          .map((enumValue) => Date.parse(enumValue))
          .filter((val) => !isNaN(val));
        try {
          column.dynamicEnumData = {
            type: 'MIN_MAX',
            exceptions: enums.filter((enumValue) =>
              isNaN(Date.parse(enumValue)),
            ),
            min: new Date(Math.min(...numericEnums)).toISOString(),
            max: new Date(Math.max(...numericEnums)).toISOString(),
          };
        } catch (err) {
          console.error(
            'Could not parse date enums for column ',
            column.name,
            ' - ',
            err,
          );
          console.error('Enums: ', numericEnums);
          dateParseFailed = true;
          column.dynamicEnumSettings = {
            type: 'EXHAUSTIVE_CHAR_LIMITED',
            charLimit: 1000,
          };
          enumSettings = column.dynamicEnumSettings!;
        }
      }

      if (enumSettings.type === 'EXHAUSTIVE') {
        column.dynamicEnumData = {
          type: 'EXAMPLES',
          examples: enumSettings.topK
            ? enums.slice(0, enumSettings.topK)
            : enums,
        };
      } else if (
        enumSettings.type === 'MIN_MAX' &&
        enumSettings.format === 'NUMBER'
      ) {
        const numericEnums = enums
          .map((enumValue) => parseFloat(enumValue))
          .filter((enumValue) => !isNaN(enumValue));

        const minVal = Math.min(...numericEnums);
        const maxVal = Math.max(...numericEnums);

        column.dynamicEnumData = {
          type: 'MIN_MAX',
          min: Number.isInteger(minVal) ? minVal.toString() : minVal.toFixed(2),
          exceptions: enums.filter((enumValue) => isNaN(parseFloat(enumValue))),
          max: Number.isInteger(maxVal) ? maxVal.toString() : maxVal.toFixed(2),
        };
      } else if (enumSettings.type === 'EXHAUSTIVE_CHAR_LIMITED') {
        // Add examples until we hit the char limit
        const examples: string[] = [];
        let charCount = 0;
        for (const enumValue of enums) {
          if (enumValue === null) {
            if (!examples.includes('null')) examples.push('null');
            continue;
          }

          if (charCount + enumValue.length > enumSettings.charLimit) break;
          examples.push(enumValue);
          charCount += enumValue.length;
        }

        column.dynamicEnumData = {
          type: 'EXAMPLES',
          examples,
        };
      }
    }
  }

  return tables;
}

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

export default {
  getEnumsForColumnFromSqlite,
  updateDDLWithDynamicEnums,
  addColumnTypes,
  generateSQLDDL,
};
