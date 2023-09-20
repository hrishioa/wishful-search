import { LLMSearcheableDatabase } from './db';
import { generateLLMMessages } from './magic-search';
import { generateSQLDDL } from './structured-ddl';
import { DBColumn, DDLTable, LLMCallFunc, LLMConfig, QQTurn } from './types';

export class WishfulSearchEngine<ElementType> {
  private db: LLMSearcheableDatabase<ElementType>;
  private history: {
    question: string;
    query: string;
  }[] = [];
  private queryPrefix: string;
  private latestIncompleteQuestion: string | null;

  static async create<ElementType>(
    name: string,
    tables: DDLTable[],
    primaryKey: DBColumn,
    objectToTabledRow: (rowObject: ElementType) => any[][],
    llmConfig: LLMConfig,
    callLLM: LLMCallFunc | null,
    saveAndReturnObjects = true,
    saveHistory: boolean = true,
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
      llmConfig,
      callLLM,
      saveAndReturnObjects,
      saveHistory,
      enableDynamicEnums,
      sortEnumsByFrequency,
    );

    return searcheableDatabase;
  }

  private constructor(
    db: LLMSearcheableDatabase<ElementType>,
    readonly name: string,
    private readonly tables: DDLTable[],
    private readonly primaryKey: DBColumn,
    private readonly llmConfig: LLMConfig,
    private readonly callLLM: LLMCallFunc | null,
    private readonly saveAndReturnObjects: boolean,
    private readonly saveHistory: boolean,
    private readonly enableDynamicEnums: boolean,
    private readonly sortEnumsByFrequency: boolean,
  ) {
    this.db = db;
    this.queryPrefix = this.generateQueryPrefix();
    this.latestIncompleteQuestion = null;
  }

  private generateQueryPrefix() {
    return `SELECT ${this.primaryKey.column} FROM ${this.primaryKey.table}`;
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

        const enumSettings = column.dynamicEnumSettings!;

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
          enumSettings.type === 'MIN_MAX' &&
          enumSettings.format === 'DATE'
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
        } else if (enumSettings.type === 'EXHAUSTIVE_CHAR_LIMITED') {
          // Add examples until we hit the char limit
          const examples: string[] = [];
          let charCount = 0;
          for (const enumValue of enums) {
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

  generateSearchMessages(question: string) {
    if (this.saveHistory) this.latestIncompleteQuestion = question;

    return generateLLMMessages(
      generateSQLDDL(this.tables, true),
      question,
      this.queryPrefix,
      this.llmConfig.userStartsQuery,
      this.history,
      this.llmConfig.fewShotLearning,
      this.llmConfig.enableTodaysDate,
    );
  }

  searchWithPartialQuery(partialQuery: string) {
    if (this.saveHistory && this.latestIncompleteQuestion)
      this.history.push({
        question: this.latestIncompleteQuestion,
        query: partialQuery,
      });

    this.latestIncompleteQuestion = null;

    const fullQuery = this.queryPrefix + ' ' + partialQuery;

    console.log('Full query is ', fullQuery);

    const results = this.db.rawQuery(fullQuery);

    console.log('Got results - ', results);
  }

  async search(question: string) {
    if (!this.callLLM)
      throw new Error(
        'No LLM call function provided. Use generateSearchMessages instead if you intent to make your own calls.',
      );

    const messages = this.generateSearchMessages(question);

    console.log('Calling with messages ', JSON.stringify(messages, null, 2));

    const partialQuery = await this.callLLM(messages);

    console.log('Got partial query ', partialQuery);

    if (!partialQuery) return [];

    const fullQuery = this.queryPrefix + ' ' + partialQuery;

    console.log('Full query is ', fullQuery);

    const results = this.db.rawQuery(fullQuery);

    console.log('Got results - ', results);
  }
}
