import { DBColumn, LLMSearcheableDatabase } from './db';
import { DDLTable, generateSQLDDL } from './structured-ddl';

export class WishfulSearchEngine<ElementType> {
  private db?: LLMSearcheableDatabase<ElementType>;
  private dbCreationPromise: Promise<LLMSearcheableDatabase<ElementType>>;

  constructor(
    private readonly name: string,
    private readonly tables: DDLTable[],
    private readonly primaryKey: DBColumn,
    private readonly objectToTabledRow: (rowObject: ElementType) => any[][],
    private readonly enableDynamicEnums = true,
    private readonly sortEnumsByFrequency = false,
    sqljsWasmURL?: string,
  ) {
    this.dbCreationPromise = LLMSearcheableDatabase.create(
      generateSQLDDL(tables, false),
      name,
      primaryKey,
      objectToTabledRow,
      sqljsWasmURL,
    ).then((db) => {
      this.db = db;
      return db;
    });
  }

  private async getDb() {
    if (!this.db) {
      this.db = await this.dbCreationPromise;
    }
    return this.db;
  }

  async index(elements: ElementType[], errorOnInvalidData = false) {
    const db = await this.getDb();
    db.insert(elements);

    // TODO: Do enum calculation if we need to
  }

  async remove(elementIds?: string[]) {
    const db = await this.getDb();
    if (elementIds) return db.delete(elementIds);
    else return db.clearDb();
  }
}
