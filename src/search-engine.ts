import { generateAutoSearchMessages } from './autosearch';
import { LLMSearcheableDatabase } from './db';
import { fixJSON } from './json-utils';
import {
  HISTORY_RESET_COMMAND,
  generateLLMMessages,
  searchPrompt,
} from './magic-search';
import { generateSQLDDL, validateStructuredDDL } from './structured-ddl';
import {
  Analysis,
  AutoSearchHistoryElement,
  DBColumn,
  DDLTable,
  LLMCallFunc,
  LLMCompatibleMessage,
  LLMConfig,
  QQTurn,
  potentialArrayAnalysisFields,
} from './types';

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
  private history: QQTurn[] = [];
  private queryPrefix: string;
  private latestIncompleteQuestion: string | null;
  private callLLM: LLMCallFunc | null;
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
    validateStructuredDDL(tables);

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
    callLLM: LLMCallFunc | null,
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
    this.callLLM = callLLM;
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
            .filter((enumValue) => !isNaN(enumValue));

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
          const numericEnums = enums.map((enumValue) => Date.parse(enumValue));
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
    const insertErrors = this.db.insert(elements, errorOnInvalidData);

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
      this.history,
      this.llmConfig.fewShotLearning,
      this.llmConfig.enableTodaysDate,
    );
  }

  cantReturnFullObjects() {
    return !this.getKeyFromObject || !this.elementDict;
  }

  /**
   * Searches the engine if you have a partial query from the LLM.
   * @param partialQuery A query (excluding the search prefix like
   * 'SELECT id from elements ') to run against the db.
   * @returns list of elements if getKeyFromObject is provided, else
   * returns a list of keys.
   */
  searchWithPartialQuery(
    partialQuery: string,
    printQuery?: boolean,
  ): string[] | ElementType[] {
    if (this.saveHistory && this.latestIncompleteQuestion)
      this.history.push({
        question: this.latestIncompleteQuestion,
        partialQuery,
      });

    this.latestIncompleteQuestion = null;

    const fullQuery = this.queryPrefix + ' ' + partialQuery;

    if (printQuery) console.log('\nQuery: ', fullQuery);

    const results = this.db.rawQuery(fullQuery);

    if (this.cantReturnFullObjects()) return results;
    else
      return results
        .map((key) => this.elementDict![key])
        .filter((element) => !!element) as ElementType[];
  }

  /**
   * Calls the LLM with generated search messages to get the partial query.
   * Does some additional string processing as needed, to make sure we have a partial query.
   * @param messages
   * @returns
   */
  async getQueryFromLLM(messages: LLMCompatibleMessage[]) {
    if (!this.callLLM)
      throw new Error(
        'No LLM call function provided. Use generateSearchMessages instead if you intent to make your own calls.',
      );

    let partialQuery = await this.callLLM(messages, this.queryPrefix);

    if (!partialQuery)
      throw new Error('Could not generate query from question with LLM');

    const extractedSQL = partialQuery.match(/```sql([\s\S]*?)```/g);
    if (extractedSQL?.length)
      partialQuery = extractedSQL[0]
        .replace(/```sql/g, '')
        .replace(/```/g, '')
        .trim();

    if (partialQuery.toLowerCase().startsWith(this.queryPrefix.toLowerCase())) {
      partialQuery = partialQuery.substring(this.queryPrefix.length).trim();
    }

    // if partialquery starts with SELECT...FROM we remove that and the word after that
    const selectFromRegex = /^\s*?SELECT[\s\S]*?FROM[\s\S]+?\s/;
    if (selectFromRegex.test(partialQuery)) {
      partialQuery = partialQuery.replace(selectFromRegex, '').trim();
    }

    // if partialquery has ; in it we remove everything after it
    const semicolonIndex = partialQuery.indexOf(';');
    if (semicolonIndex !== -1) {
      partialQuery = partialQuery.substring(0, semicolonIndex).trim();
    }

    return partialQuery;
  }

  /**
   * Runs more complex looping search until the best result is found.
   * @param userQuestion The original user question.
   * @param toStringFunc Function to stringify an element. Shorter is better, but include key fields.
   * @param optimizationRounds Maximum number of rounds to optimize result.
   * @param successThreshold Between 0 to 1, 1 is perfect match. Lower this if the LLM keeps looping without end.
   * @param callLLM Optional - supply a smarter llm adapter.
   * @param printQueries Print the queries to the console.
   * @param verbose Print analysis and other step-related information.
   * @param currentQuestion Optional - this is the optimized question in each loop. Edit/supply this if you want to intervene.
   * @param history Optional - History of past results, queries and analysis.
   * @returns
   */
  async autoSearch(
    userQuestion: string,
    toStringFunc: (element: ElementType) => string,
    optimizationRounds: number,
    successThreshold: number,
    callLLM?: LLMCallFunc | null,
    printQueries?: boolean,
    verbose?: boolean,
    currentQuestion?: string,
    history?: AutoSearchHistoryElement[],
  ): Promise<ElementType[]> {
    if (!currentQuestion) currentQuestion = userQuestion;

    if (verbose)
      console.log(
        `\n----------------------------------------------\nAutosearch Rounds Left: ${
          optimizationRounds + 1
        },\n   Main Question: ${userQuestion}\n   Current question: ${currentQuestion}.\n   Searching...`,
      );

    if (this.cantReturnFullObjects())
      throw new Error(
        'Please provide a getKeyFromObject function at creation to use autoSearch. Otherwise, use search instead.',
      );

    if (!callLLM) callLLM = this.callLLM;

    if (!callLLM)
      throw new Error(
        'Please provide a callLLM function at creation or as a parameter to use autoSearch. Otherwise, use search instead.',
      );

    const messages = this.generateSearchMessages(currentQuestion);

    const partialQuery = await this.getQueryFromLLM(messages);

    let results: ElementType[] = [];

    try {
      results = this.searchWithPartialQuery(
        partialQuery,
        printQueries,
      ) as ElementType[];
    } catch (err) {
      if (verbose)
        console.error(
          'Error in query ',
          partialQuery,
          ' - reflecting and fixing...',
        );

      results = (await this.attemptReflection(
        [...messages],
        partialQuery,
        err,
        verbose,
      )) as ElementType[];
    }

    if (verbose)
      if (results.length)
        console.log(
          `\nFiltered ${results.length} from ${
            Object.keys(this.elementDict!).length
          }. Top result: `,
          toStringFunc(results[0]!),
        );
      else console.log('\nNo results.');

    if (optimizationRounds <= 0) return results;

    if (!history) history = [];

    history.push({
      question: currentQuestion,
      query: this.queryPrefix + ' ' + partialQuery,
      results: {
        count: results.length,
        topResultStr: results.length
          ? toStringFunc(results[0]!)
          : 'No results.',
      },
    });

    const thoughtMessages = generateAutoSearchMessages(
      generateSQLDDL(this.tables, true),
      userQuestion,
      history,
    );

    if (verbose) console.log('\nAnalysing...');

    function extractInnermostBraces(str: string): string {
      const regex = /\{[^{}]*\}/;
      const match = str.match(regex);

      if (match) {
        return match[0].slice(1, -1); // Remove the outermost { and }
      }

      return str;
    }

    let analysisStr = await callLLM(thoughtMessages);

    if (!analysisStr) throw new Error('Could not generate analysis from LLM.');

    analysisStr = extractInnermostBraces('{' + analysisStr! + '}');

    analysisStr = `{${analysisStr}}`;

    try {
      const analysis: Analysis | null = await fixJSON(callLLM, analysisStr);

      if (analysis === null) {
        if (verbose && results.length)
          console.log(
            'No results, returning results from previous improvement ',
            currentQuestion,
          );
        return results;
      }

      for (const potentialArrayField of potentialArrayAnalysisFields) {
        if (!(analysis as any)[potentialArrayField])
          (analysis as any)[potentialArrayField] = [];
        else if (!Array.isArray((analysis as any)[potentialArrayField]))
          (analysis as any)[potentialArrayField] = [
            (analysis as any)[potentialArrayField],
          ];
      }

      if (verbose)
        console.log(
          `Success: ${analysis.suitability} (${analysis.suitabilityDesc}), Success threshold: ${successThreshold}`,
        );

      history[history.length - 1]!.suitabilityDesc = analysis.suitabilityDesc;
      history[history.length - 1]!.suitabilityScore = analysis.suitability;

      if (analysis.suitability >= successThreshold) {
        if (verbose) console.log('Success! Returning results.');
        return results;
      }

      if (verbose) {
        console.log(
          '\nUser desires: ',
          '\n - ' + analysis.desires.join('\n - '),
        );
        console.log('\nThoughts: ', '\n - ' + analysis.thoughts.join('\n - '));
        console.log(
          '\nBetter filters: ',
          '\n - ' + analysis.betterFilters.join('\n - '),
        );

        console.log('\n\nBetter question: ', analysis.betterQuestion);
      }

      const betterResults = await this.autoSearch(
        userQuestion,
        toStringFunc,
        optimizationRounds - 1,
        successThreshold,
        callLLM,
        printQueries,
        verbose,
        analysis.betterQuestion,
        history,
      );

      if (!betterResults.length) {
        if (verbose && results.length)
          console.log(
            'No results, returning results from previous improvement ',
            currentQuestion,
          );
        return results;
      } else {
        return betterResults;
      }
    } catch (err) {
      console.error(
        'Could not parse JSON analysis from this string - ',
        analysisStr,
        ' - ',
        err,
      );

      return results;
    }
  }

  /**
   * Full search function that generates the LLM messages, calls
   * the LLM, and returns either a list of keys or elements depending
   * on instantiating config.
   * @param question Search question from the user.
   * @param verbose Print more output to the console.
   * @param reflectAndFix If the query fails, reflect and fix the query
   * @returns If getKeyFromObject is set, this returns a list of elements.
   * If not, returns a list of keys you can use yourself.
   */
  async search(
    question: string,
    verbose?: boolean,
    reflectAndFix?: boolean,
  ): Promise<string[] | ElementType[]> {
    const messages = this.generateSearchMessages(question);

    const partialQuery = await this.getQueryFromLLM(messages);

    try {
      const results = this.searchWithPartialQuery(partialQuery, verbose);
      return results;
    } catch (err: any) {
      if (reflectAndFix) {
        return await this.attemptReflection(
          [...messages],
          partialQuery,
          err,
          verbose,
        );
      } else {
        throw err;
      }
    }
  }

  /**
   * Reflect errors back to the LLM and attempt a fix.
   * @param searchMessages
   * @param partialQuery
   * @param err
   * @param verbose
   * @returns
   */
  async attemptReflection(
    searchMessages: LLMCompatibleMessage[],
    partialQuery: string,
    err: any,
    verbose?: boolean,
  ) {
    if (verbose)
      console.error(
        'Error in query ',
        partialQuery,
        ' - reflecting and fixing...',
      );

    searchMessages.push({
      role: 'assistant',
      content: this.queryPrefix + ' ' + partialQuery,
    });
    searchMessages.push({
      role: 'user',
      content: searchPrompt.reflection(err.toString()),
    });

    const fixedPartialQuery = await this.getQueryFromLLM(searchMessages);

    const fixedResults = this.searchWithPartialQuery(
      fixedPartialQuery,
      verbose,
    );

    return fixedResults;
  }

  /**
   * Generate few-shot examples using a smarter model,
   * that can be auto-emdedded in the prompt.
   * @param smarterCallLLMFunc adapter call function from a smarter model.
   * @param fewShotQuestions some questions to generate responses for. For longer contexts, clear the history at some point to teach the model how to start a new search.
   * @param noQuestionsWithZeroResults remove any questions whose queries yielded no results. A useful check, but sometimes it's what you're going for.
   * @param errorOnInvalidQuestions Stop everything and throw an error if one of the questions fails, otherwise just don't include it in the final example set.
   * @param verbose Print more.
   */
  async autoGenerateFewShot(
    smarterCallLLMFunc: LLMCallFunc,
    fewShotQuestions: {
      question: string;
      clearHistory?: boolean;
    }[],
    noQuestionsWithZeroResults: boolean = false,
    errorOnInvalidQuestions: boolean = false,
    verbose: boolean = false,
  ): Promise<QQTurn[]> {
    if (this.latestIncompleteQuestion)
      throw new Error(
        'It seems there is a search in progress, or partially completed. FewShot generation is best done at the very beginning, after seeding your data.',
      );

    const historyBackup = [...this.history];
    const callLLMBackup = this.callLLM;
    this.history = [];
    this.callLLM = smarterCallLLMFunc;

    let fewShotLearningBatch: QQTurn[] = [];

    if (verbose)
      console.log(
        `############# Generating few-shot learning ########################`,
      );

    for (const question of fewShotQuestions) {
      try {
        const tempHistoryBackup = [...this.history];

        if (verbose) console.log('Question: ', question.question);

        if (question.clearHistory) this.history = [];

        const partialQuery = await this.getQueryFromLLM(
          this.generateSearchMessages(question.question),
        );

        if (verbose)
          console.log(`Full Query: ${this.queryPrefix} ${partialQuery}`);

        const results = this.searchWithPartialQuery(partialQuery);

        if (verbose) console.log(`Got ${results.length} results.`);

        if (!noQuestionsWithZeroResults || results.length) {
          fewShotLearningBatch.push({
            question: `${
              question.clearHistory ? HISTORY_RESET_COMMAND + ' ' : ''
            }${question.question}`,
            partialQuery,
          });
        } else {
          if (verbose) console.log('Skipping question with 0 results.');
          this.history = tempHistoryBackup;
        }
      } catch (err) {
        if (errorOnInvalidQuestions) {
          this.history = historyBackup;
          this.callLLM = callLLMBackup;

          throw new Error(
            `Could not process question ${question.question} - ${err}`,
          );
        } else {
          console.error(
            'Could not process question ',
            question.question,
            ' - ',
            err,
          );
        }
      }
    }

    if (verbose)
      console.log(
        '############## Generated examples:',
        JSON.stringify(fewShotLearningBatch, null, 2),
      );

    this.history = historyBackup;
    this.callLLM = callLLMBackup;

    this.llmConfig.fewShotLearning = fewShotLearningBatch;

    return fewShotLearningBatch;
  }
}
