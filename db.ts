import initSqlJs, { Database, SqlJsStatic } from 'sql.js';

export type DBColumn = {
  table: string;
  column: string;
};

export type InsertionErroredRow = {
  index: number;
  error: any;
};

/**
 * Why not use an ORM? Because I didn't want lock-in and I wanted to keep it simple.
 * And yes I'm ending up building a bad ORM.
 */

export class LLMSearcheableDatabase<RowObject> {
  private db: Database;
  private tableNames: string[];

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

  private getTableNames(): string[] {
    const result = this.db.exec(
      'SELECT name FROM sqlite_master WHERE type="table"',
    );
    if (!result.length) throw new Error('No tables found in database');
    const tableNames = result[0].values.flat() as string[];
    return tableNames;
  }

  getEnums(column: DBColumn, sortByFrequency: boolean = false) {
    const query = sortByFrequency
      ? `SELECT ${column.column}, COUNT(${column.column}) as frequency
    FROM ${column.table}
    GROUP BY ${column.column}
    ORDER BY frequency DESC;`
      : `SELECT DISTINCT ${column.column} FROM ${column.table}`;

    const result = this.db.exec(
      `SELECT DISTINCT ${column.column} FROM ${column.table}`,
    );

    if (!result.length) return [];

    const enums = sortByFrequency
      ? (result[0].values.map((val) => val[0]) as string[])
      : (result[0].values.flat() as string[]);

    return enums;
  }

  rawQueryKeys(key: DBColumn, query: string): string[] {
    const fullSQLQuery = `SELECT ${key.column} FROM ${key.table} WHERE ${query}`;

    const result = this.db.exec(fullSQLQuery);

    if (!result.length) return [];

    const keys = result[0].values.flat() as string[];

    return keys;
  }

  private getColumnCount(tableName: string): number {
    return this.db.exec(
      `SELECT COUNT(*) FROM pragma_table_info('${tableName}')`,
    )[0].values[0][0] as number;
  }

  delete(keys: string[]) {
    const placeholders = keys.map((key) => '?').join(',');

    const query = `DELETE FROM ${this.key.table} WHERE ${this.key.column} IN (${placeholders})`;

    this.db.run(query, keys);
  }

  insert(
    objects: RowObject[],
    errorOnInvalidRows = false,
  ): InsertionErroredRow[] {
    const rows = objects.map((object) => this.objectToTabledRow(object));

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

    for (const objectRows of rows) {
      for (let i = 0; i < this.tableNames.length; i++) {
        const currentTable = this.tableNames[i];
        const columnCount = this.getColumnCount(currentTable);

        const stmt = this.db.prepare(
          `INSERT INTO ${currentTable} VALUES (${Array(columnCount)
            .fill('?')
            .join(',')})`,
        );

        try {
          this.db.run('BEGIN');

          const tableRows = objectRows[i];

          tableRows.forEach((row) => {
            try {
              stmt.bind(row);
              stmt.step();
            } catch (err) {
              if (errorOnInvalidRows)
                throw new Error(`Error inserting row ${row[i]} - ${err}`);
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

  clearDb() {
    this.db.close();
    this.db = new this.sqljsSQL.Database();
    this.db.run(this.strDDL);
  }
}
