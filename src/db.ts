import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { DBColumn, InsertionErroredRow } from './types';

/**
 * Why not use an ORM? Because I didn't want lock-in and I wanted to keep it simple.
 * And yes I'm ending up building a bad ORM.
 */

/**
 * This class maintains the sqlite database instance to
 * run queries against. Nothing particularly new here, except to
 * manage the conversion of object to relational data, and to
 * dynamically generate enum values for feeding back to the LLM.
 */
export class LLMSearcheableDatabase<RowObject> {
  private db: Database;
  private tableNames: string[];

  /**
   * Static factory function since we can't have async constructors.
   * Creates a new database instance with own sqljs and tables.
   * @param strDDL table definitions in SQL, .e.g. 'CREATE TABLE...'
   * @param dbName Name of the database. Mainly for labelling.
   * @param key The primary key of the entire database. Provide the
   * name of a table and a column.
   * @param objectToTabledRow Object-to-relational mapping. Accepts an
   * object and returns an array of arrays, each top level array being
   * the row for one table.
   * @param sqljsWasmURL Provide your own sqljs wasm if you're
   * client-side, or you would like to employ better caching.
   * @returns a new LLM searcheable database object.
   */
  static async create<RowObject>(
    strDDL: string,
    dbName: string,
    key: DBColumn,
    objectToTabledRow: (rowObject: RowObject) => any[][],
    sqljsWasmURL?: string,
  ) {
    const sqljsOptions: {
      locateFile?: (filename: string) => string;
    } = {
      locateFile: sqljsWasmURL ? () => sqljsWasmURL : undefined,
    };

    const sqljsSQL = await initSqlJs(sqljsOptions);
    const db = new sqljsSQL.Database();
    db.run(strDDL);

    const searcheableDatabase = new LLMSearcheableDatabase<RowObject>(
      db,
      sqljsSQL,
      strDDL,
      dbName,
      key,
      objectToTabledRow,
    );

    return searcheableDatabase;
  }

  private constructor(
    db: Database,
    private readonly sqljsSQL: SqlJsStatic,
    readonly strDDL: string,
    readonly dbname: string, // Just for tagging for now
    readonly key: DBColumn,
    readonly objectToTabledRow: (rowObject: RowObject) => any[][],
  ) {
    this.db = db;
    this.tableNames = this.getTableNames();

    if (!this.tableNames.includes(key.table))
      throw new Error(`Primary table ${key.table} not found in database`);

    this.tableNames = [
      key.table,
      ...this.tableNames.filter((table) => table !== key.table),
    ];
  }

  /**
   * Dynamically retrieve the list of tables from the database.
   * TODO: See if it's better to just use the structured DDL.
   * @returns
   */
  private getTableNames(): string[] {
    const result = this.db.exec(
      'SELECT name FROM sqlite_master WHERE type="table"',
    );
    if (!result || !result.length || !result[0])
      throw new Error('No tables found in database');
    const tableNames = result[0].values.flat() as string[];
    return tableNames;
  }

  /**
   * Retrieves the distinct values being stored in a column.
   * @param column table name and column name.
   * @param sortByFrequency sorts the returned values by most frequent first.
   * @returns string array of distinct values in the column,
   */
  getEnums(column: DBColumn, sortByFrequency: boolean = false): string[] {
    const query = sortByFrequency
      ? `SELECT ${column.column}, COUNT(${column.column}) as frequency
    FROM ${column.table}
    GROUP BY ${column.column}
    ORDER BY frequency DESC;`
      : `SELECT DISTINCT ${column.column} FROM ${column.table}`;

    const result = this.db.exec(query);

    if (!result.length || !result[0]) return [];

    const enums = sortByFrequency
      ? (result[0].values.map((val) => val[0]) as string[])
      : (result[0].values.flat() as string[]);

    return enums;
  }

  /**
   * Execute a raw search query against the database.
   * @param query string query, must start with 'SELECT'
   * @returns
   */
  rawQuery(query: string): string[] {
    const result = this.db.exec(query);

    query = query.split(';')[0]!.trim();

    if (!query.toUpperCase().startsWith('SELECT'))
      throw new Error('Raw Query to db must start with SELECT');

    if (query.indexOf(';') !== -1)
      throw new Error('Raw Query to db must be a single statement');

    if (!result.length || !result[0]) return [];

    const keys = result[0].values.flat() as string[];

    return keys;
  }

  private getColumnCount(tableName: string): number {
    const result = this.db.exec(
      `SELECT COUNT(*) FROM pragma_table_info('${tableName}')`,
    );

    if (!result || !result.length || !result[0])
      throw new Error('Tried to get columns on invalid db');

    return result[0].values[0]![0] as number;
  }

  /**
   * Delete specified keys from the database.
   * @param keys
   */
  delete(keys: string[]) {
    const placeholders = keys.map((_) => '?').join(',');

    const query = `DELETE FROM ${this.key.table} WHERE ${this.key.column} IN (${placeholders})`;

    this.db.run(query, keys);
  }

  /**
   * Insert elements into the database for searching.
   * @param elements Array of elements
   * @param errorOnInvalidRows Whether to throw an error and halt
   * the entire db transaction when one object fails to insert.
   * Otherwise, a list of errors in returned as an array.
   * @returns List of failed objects, with index and error.
   */
  insert(
    elements: RowObject[],
    errorOnInvalidRows = false,
  ): InsertionErroredRow[] {
    const rows = elements.map((object) => this.objectToTabledRow(object));

    const validRows = rows.filter(
      (row) => row.length === this.tableNames.length,
    );

    if (validRows.length !== rows.length && errorOnInvalidRows)
      throw new Error(
        `${
          rows.length - validRows.length
        } rows do not match the number of columns in the table.`,
      );

    const invalidRows: InsertionErroredRow[] = [];

    for (const elementRows of rows) {
      for (let i = 0; i < this.tableNames.length; i++) {
        const currentTable = this.tableNames[i];
        const columnCount = this.getColumnCount(currentTable!);

        const stmt = this.db.prepare(
          `INSERT OR IGNORE INTO ${currentTable} VALUES (${Array(columnCount)
            .fill('?')
            .join(',')})`,
        );

        try {
          this.db.run('BEGIN');

          const tableRows = elementRows[i];

          tableRows!.forEach((row) => {
            try {
              stmt.bind(row);
              stmt.step();
            } catch (err) {
              if (errorOnInvalidRows)
                throw new Error(`Error inserting row ${elementRows} - ${err}`);
              else
                invalidRows.push({
                  index: i,
                  error: err,
                });
            }
          });

          this.db.run('COMMIT');
        } catch (err) {
          this.db.run('ROLLBACK');
          throw err;
        }
      }
    }

    return invalidRows;
  }

  /**
   * Clear and reset the entire database completely.
   */
  clearDb() {
    this.db.close();
    this.db = new this.sqljsSQL.Database();
    this.db.run(this.strDDL);
  }
}
