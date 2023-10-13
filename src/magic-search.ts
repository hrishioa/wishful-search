import { LLMCompatibleMessage, QQTurn } from './types';

/**
 * This is the primary collection of prompt templates that makes
 * wishful-search work.
 */

// prettier-ignore
const searchPrompt = {
  system: (ddl: string, dateStr?: string) =>
`You are a SQLite SQL generator that helps users answer questions from the tables provided. Here are the table definitions:

FLIGHT_DATABASE_DDL:
\`\`\`sql
${ddl}
\`\`\`

${dateStr ? `Today's date: ${dateStr}.` : ''}

RULES:
\"\"\"
1. Do not use LIMIT, DISTINCT, ARRAY_LENGTH, MAX, MIN or AVG.
2. Prefer \`strftime\` to format dates better.
3. **Deliberately go through the question and database schema word by word** to appropriately answer the question
4. Prefer sorting the right values to the top instead of filters if possible.
5. Number of segments for a direct flight is one.
6. Try to continue the partial query.
\"\"\"

Provide an appropriate SQLite Query to return the keys to answer the user's question. Only filter by the things the user asked for, and only return ids or keys.` ,
  user: (question: string, firstQuestion: boolean) => `${firstQuestion ? 'Ignore all previous filters. ': ''}${question}`,
  assistant: (query: string, queryPrefix: string) => `${queryPrefix} ${query}`,
}

export function generateLLMMessages(
  dbDDL: string,
  question: string,
  queryPrefix: string,
  history: QQTurn[],
  fewShotLearningBatch?: QQTurn[],
  enableTodaysDate?: boolean,
): LLMCompatibleMessage[] {
  const dateStr = enableTodaysDate
    ? new Date().toLocaleDateString()
    : undefined;

  const messages: LLMCompatibleMessage[] = [];

  messages.push({
    role: 'system',
    content: searchPrompt.system(dbDDL, dateStr),
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

  if (!fewShotLearningBatch?.length)
    messages.push({
      role: 'assistant',
      content: queryPrefix,
    });

  return messages;
}
