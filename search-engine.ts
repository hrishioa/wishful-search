import { LLMSearcheableDatabase } from './db';
import { generateLLMMessages } from './magic-search';
import { generateSQLDDL } from './structured-ddl';
import { DBColumn, DDLTable, LLMCallFunc, LLMConfig, QQTurn } from './types';

/**
 * This class runs wishful search. With the right config, it can:
 * * store your objects for retrieval
 * * search them with plaintext user questions
 * * maintain history, element list, learning dataset
 * * generate dynamic enums so the LLM knows what's inside the table.
 * Most of the parts are exposed, so you can simply generate your
 * own DDLs or prompts and call the LLM yourself.
 */
export class WishfulSearchEngine<ElementType> {
  private db: LLMSearcheableDatabase<ElementType>;
  private history: {
    question: string;
    query: string;
  }[] = [];
  private queryPrefix: string;
  private latestIncompleteQuestion: string | null;
  private elementDict: {
    [key: string]: ElementType;
  } | null;

  /**
   * Creates and returns an instance of wishful search engine.
   * @param name Name of the engine/db - for labelling.
   * @param tables Structured table definitions. See generateSQLDDL
   * for how this is used to create the final string DDL.
   * @param primaryKey primary index of the entire database, to be used for retrieval.
   * @param objectToTabledRow Object-to-relational mapping function.
   * Accepts an object and returns an array of arrays, each top level
   * array being the row for one table.
   * @param llmConfig configuration how the llm is used
   * to generate queries.
   * * UserStartsQuery indicates whether the query prefix can be placed
   *  in the assistant's mouth instead of the user's.
   * * enableTodaysDate adds the current date to the prompt.
   * * fewShotLearning is a dataset of prior examples.
   * @param callLLM Use a generator function from llm-adapters.ts
   * to create a callLLM wrapper for your model - be in OpenAI, Claude
   * or something else.
   * @param getKeyFromObject Function to retrieve the value for the same
   * primarykey as primaryKey. If this is set, search will hold on to
   * the full object list and use it to return full objects instead of
   * just keys. More memory use, but more convenient.
   * @param saveHistory Maintain a history of previous questions.
   * @param enableDynamicEnums Generate new enum values every time
   * new rows are inserted, based on the structured DDL spec. These
   * enum values are fed to the LLM.
   * @param sortEnumsByFrequency Whether to sort the enums provided to
   * the LLM by most common. Uses more resources, but significantly
   * improves results.
   * @param sqljsWasmURL Provide your own sqljs wasm if you're
   * client-side, or you would like to employ better caching.
   * @returns
   */
  static async create<ElementType>(
    name: string,
    tables: DDLTable[],
    primaryKey: DBColumn,
    objectToTabledRow: (element: ElementType) => any[][],
    llmConfig: LLMConfig,
    callLLM: LLMCallFunc | null,
    getKeyFromObject: ((element: ElementType) => string) | null,
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
      getKeyFromObject,
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
    private readonly getKeyFromObject:
      | ((element: ElementType) => string)
      | null,
    private readonly saveHistory: boolean,
    private readonly enableDynamicEnums: boolean,
    private readonly sortEnumsByFrequency: boolean,
  ) {
    this.db = db;
    this.queryPrefix = this.generateQueryPrefix();
    this.latestIncompleteQuestion = null;
    this.elementDict = getKeyFromObject ? {} : null;
  }

  /**
   * The query prefix makes sure that the SQL being run is a
   * SELECT query, and that it fetches the db primary key.
   * @returns
   */
  private generateQueryPrefix() {
    return `SELECT ${this.primaryKey.column} FROM ${this.primaryKey.table}`;
  }

  /**
   * Finds the distinct values for each column as specified in the ddl.
   * Also converts them into distinct examples, min-max for numbers and
   * dates, and truncates by some fixed character limit if
   * necessary.
   * @returns
   */
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

  /**
   * Inserts an array of elements into the db and indexes them for use.
   * @param elements Array of elements.
   * @param errorOnInvalidData Throw an exception and rollback the full
   * insert if a single row fails.
   * @returns A list of indices and errros for the objects that failed.
   */
  insert(elements: ElementType[], errorOnInvalidData = false) {
    const insertErrors = this.db.insert(elements);

    this.computeEnums();

    if (this.getKeyFromObject && this.elementDict) {
      for (const element of elements) {
        this.elementDict[this.getKeyFromObject(element)] = element;
      }
    }

    return insertErrors;
  }

  /**
   * Removes elements from the engine. Nukes the entire db if called
   * without a list.
   * @param elementIds (Optional) array of elements.
   * @returns
   */
  remove(elementIds?: string[]) {
    if (this.elementDict) {
      if (elementIds)
        for (const elementId of elementIds) delete this.elementDict[elementId];
      else this.elementDict = {};
    }

    if (elementIds) return this.db.delete(elementIds);
    else return this.db.clearDb();
  }

  /**
   * Generates the search messages to the LLM based on the question.
   * You can use this to retrieve a fully formatted prompt if you'd
   * like to manipulate it or make your own calls.
   * @param question A question from the user about the dataset.
   * @returns List of OpenAI-structured messages to the LLM.
   */
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

  /**
   * Searches the engine if you have a partial query from the LLM.
   * @param partialQuery A query (excluding the search prefix like
   * 'SELECT id from elements ') to run against the db.
   * @returns list of elements if getKeyFromObject is provided, else
   * returns a list of keys.
   */
  searchWithPartialQuery(partialQuery: string): string[] | ElementType[] {
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

    // TODO: We presume it's a string[] here, need to verify

    if (!this.getKeyFromObject || !this.elementDict) return results;
    else
      return results
        .map((key) => this.elementDict![key])
        .filter((element) => !!element);
  }

  /**
   * Full search function that generates the LLM messages, calls
   * the LLM, and returns either a list of keys or elements depending
   * on instantiating config.
   * @param question Search question from the user.
   * @returns If getKeyFromObject is set, this returns a list of elements.
   * If not, returns a list of keys you can use yourself.
   */
  async search(question: string): Promise<string[] | ElementType[]> {
    if (!this.callLLM)
      throw new Error(
        'No LLM call function provided. Use generateSearchMessages instead if you intent to make your own calls.',
      );

    const messages = this.generateSearchMessages(question);

    console.log('Calling with messages ', JSON.stringify(messages, null, 2));

    const partialQuery = await this.callLLM(messages);

    console.log('Got partial query ', partialQuery);

    if (!partialQuery)
      throw new Error('Could not generate query from question with LLM');

    return this.searchWithPartialQuery(partialQuery);
  }
}
