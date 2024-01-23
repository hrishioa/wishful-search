// ################################# LLM

import { QueryExecResult } from 'sql.js';

export type LLMCompatibleMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

// Question - Query turn for few-shot learning. Queries are partial queries.
export type QQTurn = {
  complexQuery?: boolean;
  question: string;
  partialQuery: string;
};

export type FactType = 'search' | 'analytics' | 'all';

export type PromptFact = {
  factStr: string;
  type: FactType;
};

// ################################### Analytics

export const VALID_PRIMITIVE_TYPES = [
  'str',
  'int',
  'float',
  'bool',
  'enum',
  'json',
] as const;

export type StatsColumnUnknown = {
  type: 'unknown';
};

export type StatsColumnPrimitive = {
  type: (typeof VALID_PRIMITIVE_TYPES)[number];
};

export type StatsColumnDate = {
  type: 'date';
  format: 'OLE_AUTOMATION_EXCEL' | string; // provide a date format for date-fns to parse. Use dd and yyyy instead of DD and YYYY.
};

export type StatsColumnCurrency = {
  type: 'currency';
  code: string;
};

export type StatsColumnType =
  | StatsColumnUnknown
  | StatsColumnPrimitive
  | StatsColumnDate
  | StatsColumnCurrency;

//################################### DB

export type DBColumn = {
  table: string;
  column: string;
};

export type InsertionErroredRow = {
  index: number;
  error: any;
};

export type RawResults = {
  query: string;
  rawResults: (QueryExecResult & {
    columnTypes?: StatsColumnType[];
    page?: number;
    totalRows?: number;
  })[];
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
  statsColumnType?: StatsColumnType;
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
  response_format?: { type: 'json_object' };
};

export type LLMConfig = {
  enableTodaysDate: boolean;
  fewShotLearning?: QQTurn[];
};

export type LLMCallFunc = (
  messages: LLMCompatibleMessage[],
  queryPrefix?: string,
) => Promise<string | null>;

// #################### AUTO-SEARCH ####################

export type AutoSearchHistoryElement = {
  question: string;
  query: string;
  results: { count: number; topResultStr: string };
  suitabilityScore?: number;
  suitabilityDesc?: string;
};

export type Analysis = {
  suitabilityDesc: string; // Describe how suitable or unsuitable the top result is to the user's question in one sentence.
  suitability: number; // between 0 to 1, one if the top result matches the user's question and zero if not.
  desires: string[]; // What did the user want? List what may not be in the question, but is implied (or what they don't know to look for).
  thoughts: string[]; // Based on the DDL, the question and the desires, provide thoughts on how to improve results.
  betterFilters: string[]; // What conditions (in English) could we have to get better results? Relax any filters that might be reducing results.
  betterQuestion: string; // Reformat the question to include all of the above, which we can get another query from.
};

// prettier-ignore
export const AnalysisTypespec =
`type Analysis = {
  suitabilityDesc: string; // Describe how suitable or unsuitable the top result is to the USER_QUESTION in one sentence.
  suitability: number; // between 0 to 1, one if the top result matches the USER_QUESTION and zero if not.
  desires: string[]; // What did the user want? List what may not be in the question, but is implied (or what they don't know to look for).
  thoughts: string[]; // Based on the DDL, the question and the desires, provide thoughts on how to improve results.
  betterFilters: string[]; // What conditions (in English) could we have to get better results?
  betterQuestion: string; // Reformat the question to include all of the above, to be used to generate a new query. Be specific with numbers, relax filtersand reduce the question size if no results are being returned.
}`

export const potentialArrayAnalysisFields = [
  'desires',
  'thoughts',
  'betterFilters',
];
