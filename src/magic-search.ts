import { LLMCompatibleMessage, PromptFact, QQTurn } from './types';

/**
 * This is the primary collection of prompt templates that makes
 * wishful-search work.
 */

export const HISTORY_RESET_COMMAND = 'Ignore all previous filters. ';

const facts: PromptFact[] = [
  {
    factStr:
      'Do not use LIMIT, DISTINCT, ARRAY_LENGTH, MAX, MIN or AVG if possible.',
    type: 'search',
  },
  {
    factStr: 'Dont LIMIT queries.',
    type: 'analytics',
  },
  {
    factStr: 'Dont modify original column names from the tables if possible.',
    type: 'analytics',
  },
  // prettier-ignore
  {
    factStr:
`When creating new columns, always use one of the following prefixes:
- for monetary fields, prefix currencyXXX to the column name, where XXX is the currency code, e.g. currencyUSD
- otherwise prefix str, int, float, date, bool, enum, or json to the column name, .e.g. intAverage
`,
    type: 'analytics',
  },
  {
    factStr: 'Try and find the right rows that can help the answer.',
    type: 'search',
  },
  {
    factStr: 'Prefer `strftime` to format dates better.',
    type: 'all',
  },
  {
    factStr:
      '**Deliberately go through the question and database schema word by word** to appropriately answer the question.',
    type: 'all',
  },
  {
    factStr:
      'Prefer sorting the right values to the top instead of filters if possible.',
    type: 'all',
  },
  {
    factStr: 'Use LIKE instead of equality to compare strings.',
    type: 'all',
  },
  {
    factStr: 'Try to continue the partial query if one is provided.',
    type: 'all',
  },
];

// prettier-ignore
export const searchPrompt = {
  system: (ddl: string, dateStr?: string, searchType?: 'search' | 'analytics') =>
`You are a SQLite SQL generator that helps users answer questions from the tables provided. Here are the table definitions:

DATABASE_DDL:
\`\`\`sql
${ddl}
\`\`\`

${dateStr ? `Today's date: ${dateStr}.` : ''}

RULES:
\"\"\"
${facts.filter(fact => !searchType || fact.type === 'all' || fact.type === searchType).map((f, index) => `${index+1}. ${f.factStr}`).join('\n')}
\"\"\"

${searchType === 'search' ? `Provide an appropriate SQLite Query to return the keys to answer the user's question. Only filter by the things the user asked for, and only return ids or keys.` :
'Provide an appropriate SQLite query to return the answer to the user\'s question. Add any fields that would be helpful to explain the result but not too many.'}` ,
  user: (question: string, firstQuestion: boolean) => `${firstQuestion ? HISTORY_RESET_COMMAND: ''}${question}`,
  assistant: (query: string, queryPrefix: string) => `${queryPrefix} ${query}`,
  reflection: (err: string, queryPrefix: string) => `The query ran into the following issue:
  \"\"\"
  ${err}
  \"\"\"

  Fix and provide only the new query. SQL only, in code blocks. The query must start with ${queryPrefix}.`
}

export function generateLLMMessages(
  dbDDL: string,
  question: string,
  queryPrefix: string,
  history: QQTurn[],
  searchType: 'search' | 'analytics',
  fewShotLearningBatch?: QQTurn[],
  enableTodaysDate?: boolean,
): LLMCompatibleMessage[] {
  const dateStr = enableTodaysDate
    ? new Date().toLocaleDateString()
    : undefined;

  const messages: LLMCompatibleMessage[] = [];

  messages.push({
    role: 'system',
    content: searchPrompt.system(dbDDL, dateStr, searchType),
  });

  if (fewShotLearningBatch) {
    for (const { question, partialQuery } of fewShotLearningBatch) {
      messages.push({
        role: 'user',
        content: searchPrompt.user(question, false),
      });

      messages.push({
        role: 'assistant',
        content: searchPrompt.assistant(partialQuery, queryPrefix),
      });
    }
  }

  if (history) {
    for (const { question, partialQuery } of history) {
      messages.push({
        role: 'user',
        content: searchPrompt.user(question, false),
      });

      messages.push({
        role: 'assistant',
        content: searchPrompt.assistant(partialQuery, queryPrefix),
      });
    }
  }

  messages.push({
    role: 'user',
    content: searchPrompt.user(question, history.length > 0 ? false : true),
  });

  if (!fewShotLearningBatch?.length && queryPrefix)
    messages.push({
      role: 'assistant',
      content: queryPrefix,
    });

  return messages;
}
