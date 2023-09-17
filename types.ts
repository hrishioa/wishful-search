// ################################# LLM

export type LLMCompatibleMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

// Question - Query turn
export type QQTurn = {
  question: string;
  query: string;
};

//################################### DB

export type DBColumn = {
  table: string;
  column: string;
};

export type InsertionErroredRow = {
  index: number;
  error: any;
};

// ################################# Structured DDL

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
