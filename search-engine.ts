import { DBColumn, LLMSearcheableDatabase } from './db';
import { DDLTable, generateSQLDDL } from './structured-ddl';

export class WishfulSearchEngine<ElementType> {
  private db: LLMSearcheableDatabase<ElementType>;

  static async create<ElementType>(
    name: string,
    tables: DDLTable[],
    primaryKey: DBColumn,
    objectToTabledRow: (rowObject: ElementType) => any[][],
    enableDynamicEnums = true,
    sortEnumsByFrequency = false,
    sqljsWasmURL?: string,
  ) {
    const db = await LLMSearcheableDatabase.create<ElementType>(
      generateSQLDDL(tables, true),
      name,
      primaryKey,
      objectToTabledRow,
      sqljsWasmURL,
    );

    const searcheableDatabase = new WishfulSearchEngine<ElementType>(
      db,
      name,
      tables,
      primaryKey,
      objectToTabledRow,
      enableDynamicEnums,
      sortEnumsByFrequency,
      sqljsWasmURL,
    );

    return searcheableDatabase;
  }

  private constructor(
    db: LLMSearcheableDatabase<ElementType>,
    private readonly name: string,
    private readonly tables: DDLTable[],
    private readonly primaryKey: DBColumn,
    private readonly objectToTabledRow: (rowObject: ElementType) => any[][],
    private readonly enableDynamicEnums = true,
    private readonly sortEnumsByFrequency = false,
    sqljsWasmURL?: string,
  ) {
    this.db = db;
  }

  private computeEnums() {
    if (!this.enableDynamicEnums) return;

    for (const table of this.tables) {
      for (const column of table.columns.filter(
        (column) => column.dynamicEnumSettings !== undefined,
      )) {
        const enums = this.db.getEnums(
          {
            table: table.name,
            column: column.name,
          },
          this.sortEnumsByFrequency,
        );

        if (column.dynamicEnumSettings!.type === 'EXHAUSTIVE') {
          column.dynamicEnumData = {
            type: 'EXAMPLES',
            examples: column.dynamicEnumSettings!.topK
              ? enums.slice(0, column.dynamicEnumSettings!.topK)
              : enums,
          };
        } else if (
          column.dynamicEnumSettings!.type === 'MIN_MAX' &&
          column.dynamicEnumSettings!.format === 'NUMBER'
        ) {
          const numericEnums = enums
            .map((enumValue) => parseFloat(enumValue))
            .filter((enumValue) => !isNaN(enumValue)); // TODO: Test for dates separately

          const minVal = Math.min(...numericEnums);
          const maxVal = Math.max(...numericEnums);

          column.dynamicEnumData = {
            type: 'MIN_MAX',
            min: Number.isInteger(minVal)
              ? minVal.toString()
              : minVal.toFixed(2),
            exceptions: enums.filter((enumValue) =>
              isNaN(parseFloat(enumValue)),
            ),
            max: Number.isInteger(maxVal)
              ? maxVal.toString()
              : maxVal.toFixed(2),
          };
        } else if (
          column.dynamicEnumSettings!.type === 'MIN_MAX' &&
          column.dynamicEnumSettings!.format === 'DATE'
        ) {
          const numericEnums = enums.map((enumValue) => Date.parse(enumValue)); // TODO: Copilot generated, test later
          column.dynamicEnumData = {
            type: 'MIN_MAX',
            exceptions: enums.filter((enumValue) =>
              isNaN(Date.parse(enumValue)),
            ),
            min: new Date(Math.min(...numericEnums)).toISOString(),
            max: new Date(Math.max(...numericEnums)).toISOString(),
          };
        } else if (
          column.dynamicEnumSettings!.type === 'EXHAUSTIVE_CHAR_LIMITED'
        ) {
          // Add examples until we hit the char limit
          const examples: string[] = [];
          let charCount = 0;
          for (const enumValue of enums) {
            if (
              charCount + enumValue.length >
              column.dynamicEnumSettings!.charLimit
            )
              break;
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
  }

  index(elements: ElementType[], errorOnInvalidData = false) {
    const insertErrors = this.db.insert(elements);

    this.computeEnums();

    console.log('DDL is ', generateSQLDDL(this.tables, true));

    return insertErrors;
  }

  remove(elementIds?: string[]) {
    if (elementIds) return this.db.delete(elementIds);
    else return this.db.clearDb();
  }
}
