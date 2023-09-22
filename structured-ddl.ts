// TODO: Make sure it's one table with joins outward

import { DDLColumn, DDLTable } from './types';

export function generateSQLDDL(
  structuredDDL: DDLTable[],
  forLLM: boolean,
): string {
  return structuredDDL
    .map((table) => generateSQLTableDDL(table, forLLM))
    .join('\n\n');
}

/**
 * Runs some basic checks on the structured DDL to make sure the
 * querying and indexing can work properly.
 * @param structuredDDL
 */
export function validateStructuredDDL(structuredDDL: DDLTable[]): boolean {
  if (!structuredDDL.length || !structuredDDL[0])
    throw new Error(
      'No tables found in structured DDL, or missing primary table.',
    );

  if (
    structuredDDL.length &&
    structuredDDL[0].columns.some((column) => !!column.foreignKey)
  )
    throw new Error(
      'Primary (first) table in the structured ddl cannot have foreign key relationships',
    );

  return true;
}

function generateComment(column: DDLColumn) {
  let examples = '';

  if (column.dynamicEnumData?.type === 'EXAMPLES') {
    examples = `e.g. ${column.dynamicEnumData.examples.join(', ')}`;
  } else if (column.dynamicEnumData?.type === 'MIN_MAX') {
    examples = `between ${column.dynamicEnumData.min} and ${column.dynamicEnumData.max}`;
    if (column.dynamicEnumData.exceptions.length) {
      examples += ` (or ${column.dynamicEnumData.exceptions
        .map((ex) => String(ex))
        .join(',')})`;
    }
  } else if (column.staticExamples?.length) {
    examples = `e.g. ${column.staticExamples.join(', ')}`;
  }

  const commentPieces: string[] = [];
  if (column.description) commentPieces.push(column.description);
  if (examples) commentPieces.push(examples);

  return commentPieces.length ? ` --${commentPieces.join(' ')}` : '';
}

/**
 * Generates a string DDL in SQL from the structured DDL format. Does
 * the following:
 * * Convert each table and columns to their definitions
 * * Adds descriptions from columns into comments
 * * Uses either static examples or dynamic enums to illustrate
 * data contents to the LLM
 * * Creates cascading deleted foreign key references
 * @param structuredDDL
 * @param forLLM Whether this DDL is for the LLM or the database.
 * If this is for the db, omits the comments and other fluff.
 * @returns string DDL ready for passing to db or LLM.
 */
export function generateSQLTableDDL(
  structuredDDL: DDLTable,
  forLLM: boolean,
): string {
  const fkRelationships = structuredDDL.columns
    .filter((column) => column.foreignKey)
    .map((column) => {
      return `FOREIGN KEY (${column.name}) REFERENCES ${column.foreignKey?.table}(${column.foreignKey?.column}) ON DELETE CASCADE`;
    });

  const tableRows = structuredDDL.columns
    .filter((column) => !forLLM || column.visibleToLLM)
    .map((column, colId) => {
      const comment = (forLLM && generateComment(column)) || '';

      return `${column.name} ${column.columnSpec}${
        colId >= structuredDDL.columns.length - 1 && !fkRelationships.length
          ? ''
          : ','
      }${comment}`;
    });

  return `CREATE TABLE IF NOT EXISTS ${structuredDDL.name} (
${tableRows.join('\n')}${
    fkRelationships.length ? `\n${fkRelationships.join('\n')}` : ''
  }
);`;
}
