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
        type: 'EXHAUSTIVE';
        topK?: number;
      }
    | {
        type: 'MIN_MAX';
        format: 'DATE' | 'NUMBER';
      }
    | {
        type: 'EXHAUSTIVE_CHAR_LIMITED';
        charLimit: number; // Making this a token limit would be better, but it makes us more model dependent and more expensive to compute
      };
  dynamicEnumData?:
    | {
        type: 'EXAMPLES';
        examples: string[];
      }
    | {
        type: 'MIN_MAX';
        exceptions: string[];
        min: string;
        max: string;
      };
  visibleToLLM: boolean;
};

export type DDLColumn = DDLColumnBase & DDLColumnMeta;

export type DDLTable = {
  name: string;
  columns: DDLColumn[];
};

// TODO: Make sure it's one table with joins outward

export function generateSQLDDL(
  structuredDDL: DDLTable[],
  forLLM: boolean,
): string {
  return structuredDDL
    .map((table) => generateSQLTableDDL(table, forLLM))
    .join('\n\n');
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
