// ################################# LLM

export type LLMCompatibleMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

// Question - Query turn for few-shot learning. Queries are partial queries.
export type QQTurn = {
  question: string;
  partialQuery: string;
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
  name: string; // Name of the column
  columnSpec: string; // SQlite type of the column
  staticExamples?: string[]; // Statically provided examples of potential values in the column
  description: string; // Description of the column, preferred empty to save tokens
  foreignKey?: {
    // Is this a foreign key? which table and column does it connect to? Only one-to-many are allowed.
    table: string;
    column: string;
  };
};

export type DDLColumnMeta = {
  dynamicEnumSettings?: // Settings for generating dynamic enums.
  | {
        type: 'EXHAUSTIVE'; // Provide an exhaustive list of all distinct values.
        topK?: number; // Only save the top K values.
      }
    | {
        type: 'MIN_MAX'; // Provide a minimum and maximum range for the values found.
        format: 'DATE' | 'NUMBER';
      }
    | {
        type: 'EXHAUSTIVE_CHAR_LIMITED';
        charLimit: number; // Total number of characters to limit the output to. Making this a token limit would be better, but it makes us more model dependent and more expensive to compute
      };
  dynamicEnumData?: // Data (generated at runtime) for the enums.
  | {
        type: 'EXAMPLES';
        examples: string[];
      }
    | {
        type: 'MIN_MAX';
        exceptions: string[]; // Exceptions to the range, like null
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

// ################################# Search Engine

export type CommonLLMParameters = {
  model: string;
  temperature?: number;
  max_tokens?: number;
};

export type LLMConfig = {
  enableTodaysDate: boolean;
  fewShotLearning?: QQTurn[];
};

export type LLMCallFunc = (
  messages: LLMCompatibleMessage[],
  queryPrefix?: string,
) => Promise<string | null>;
