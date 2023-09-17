import { DBColumn, LLMCompatibleMessage, QQTurn } from './types';

// prettier-ignore
const prompts = {
  system: (ddl: string, dateStr?: string) =>
`You are a SQLite SQL generator that helps users answer questions from the tables provided. Here are the table definitions:

FLIGHT_DATABASE_DDL:
\`\`\`sql
${ddl}
\`\`\`

${dateStr ? `Today's: ${dateStr}.` : ''}

RULES:
\"\"\"
1. Do not use DISTINCT, ARRAY_LENGTH, MAX, MIN or AVG.
2. Prefer \`strftime\` to format dates better.
3. **Deliberately go through the question and database schema word by word** to appropriately answer the question
4. **Use Table Aliases** to prevent ambiguity. For example, \`SELECT table1.col1, table2.col1 FROM table1 JOIN table2 ON table1.id = table2.id\`.
5. Prefer sorting the right values to the top instead of filters if possible.
6. Number of segments for a direct flight is one.
\"\"\"

Provide an appropriate SQLite Query to answer the user questions. Only filter by the things the user asked for.` ,
  user: (question: string) => question,
  assistant: (primaryKey: DBColumn, query: string) =>
`SELECT ${primaryKey.column} from ${primaryKey.table}${query ? ' '+query : ''};`
}

function generateLLMMessages(
  dbDDL: string,
  primaryKey: DBColumn,
  question: string,
  finalMessageIsAssistant: boolean = false,
  history?: QQTurn[],
  fewShotLearningBatch?: QQTurn[],
  enableTodaysDate?: boolean,
): LLMCompatibleMessage[] {
  const dateStr = enableTodaysDate
    ? new Date().toLocaleDateString()
    : undefined;

  const messages: LLMCompatibleMessage[] = [];

  messages.push({
    role: 'system',
    content: prompts.system(dbDDL, dateStr),
  });

  if (fewShotLearningBatch) {
    for (const { question, query } of fewShotLearningBatch) {
      messages.push({
        role: 'user',
        content: prompts.user(question),
      });

      messages.push({
        role: 'assistant',
        content: prompts.assistant(primaryKey, query),
      });
    }
  }

  if (history) {
    for (const { question, query } of history) {
      messages.push({
        role: 'user',
        content: prompts.user(question),
      });

      messages.push({
        role: 'assistant',
        content: prompts.assistant(primaryKey, query),
      });
    }
  }

  messages.push({
    role: 'user',
    content:
      prompts.user(question) +
      (finalMessageIsAssistant
        ? ''
        : `\n\n${prompts.assistant(primaryKey, '')}`),
  });

  if (finalMessageIsAssistant) {
    messages.push({
      role: 'assistant',
      content: prompts.assistant(primaryKey, ''),
    });
  }

  return messages;
}
