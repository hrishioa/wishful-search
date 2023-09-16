export type DDLColumnBase = {
  name: string;
  columnSpec: string;
  staticExamples?: string[];
  description: string;
  foreignKey?: {
    table: string;
    column: string;
  };
};

export type DDLColumnMeta = {
  dynamicEnumSettings?:
    | {
        type: 'EXHAUSTIVE' | 'NUMERIC_MIN_MAX';
      }
    | {
        type: 'CHAR_LIMITED';
        charLimit: number; // Making this a token limit would be better, but it makes us more model dependent and more expensive to compute
      };
  dynamicEnumData?: any[];
  visibleToLLM: boolean;
};

export type DDLColumn = DDLColumnBase & DDLColumnMeta;

export type DDLTable = {
  name: string;
  columns: DDLColumn[];
};

// TODO: Map numeric enums as between X and X
// TODO: Make sure it's one table with joins outward
// TODO: See if we can limit final example representation by number of tokens

export function generateSQLDDL(
  structuredDDL: DDLTable[],
  forLLM: boolean,
): string {
  return structuredDDL
    .map((table) => generateSQLTableDDL(table, forLLM))
    .join('\n\n');
}

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
      const comment =
        forLLM && (column.description || column.staticExamples?.length)
          ? `--${column.description}${
              column.staticExamples?.length
                ? ' e.g. ' + column.staticExamples?.join(', ')
                : ''
            }`
          : '';

      return `${column.name} ${column.columnSpec}${
        colId >= structuredDDL.columns.length - 1 && !fkRelationships.length
          ? ''
          : ','
      } ${comment}`;
    });

  return `CREATE TABLE IF NOT EXISTS ${structuredDDL.name} (
${tableRows.join('\n')}${
    fkRelationships.length ? `\n${fkRelationships.join('\n')}` : ''
  }
);`;
}
