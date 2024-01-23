import { generateLLMMessages, searchPrompt } from './magic-search';
import { generateSQLDDL } from './structured-ddl';
import { DDLTable, LLMCallFunc, LLMCompatibleMessage, QQTurn } from './types';

export type LLMQuery = {
  queryPrefix: string;
  partialQuery: string;
};

export class WishfulBaseEngine {
  private baseQueryPrefix: string;

  constructor(
    private readonly structuredDDLTables: DDLTable[],
    private readonly llmConfig: {
      enableCurrentDate: boolean;
    },
    private readonly callLLM: LLMCallFunc,
    private readonly engineConfig: {
      enableDynamicEnums: boolean;
      sortEnumsByFrequency: boolean;
      baseQueryPrefix?: string;
    } = {
      enableDynamicEnums: true,
      sortEnumsByFrequency: true,
    },
  ) {
    this.baseQueryPrefix = this.engineConfig.baseQueryPrefix || 'SELECT ';
  }

  private getCleanQueryFromResponse(
    potentialQuery: string,
    queryPrefix?: string,
  ) {
    if (!queryPrefix) queryPrefix = this.baseQueryPrefix;

    const extractedSQL = potentialQuery.match(/```sql([\s\S]*?)```/g);
    if (extractedSQL?.length)
      potentialQuery = extractedSQL[0]
        .replace(/```sql/g, '')
        .replace(/```/g, '')
        .trim();

    if (potentialQuery.toLowerCase().startsWith(queryPrefix.toLowerCase())) {
      potentialQuery = potentialQuery.substring(queryPrefix.length).trim();
    }

    const selectFromRegex = /^\s*?SELECT\s/;
    if (selectFromRegex.test(potentialQuery)) {
      potentialQuery = potentialQuery.replace(selectFromRegex, '').trim();
    }

    const semicolonIndex = potentialQuery.indexOf(';');
    if (semicolonIndex !== -1) {
      potentialQuery = potentialQuery.substring(0, semicolonIndex).trim();
    }

    return potentialQuery;
  }

  generatePrompt(
    question: string,
    history: QQTurn[] = [],
    fewShotLearning: QQTurn[] = [],
    forceConfig: {
      queryPrefix?: string;
    } = {},
  ): LLMCompatibleMessage[] {
    const messages = generateLLMMessages(
      generateSQLDDL(this.structuredDDLTables, true),
      question,
      forceConfig.queryPrefix || this.baseQueryPrefix,
      history,
      'analytics',
      fewShotLearning,
      this.llmConfig.enableCurrentDate,
    );

    return messages;
  }

  async generateQuery(
    messages: LLMCompatibleMessage[],
    forceConfig: {
      queryPrefix?: string;
      callLLM?: LLMCallFunc;
    } = {},
  ): Promise<LLMQuery> {
    const callLLM = forceConfig.callLLM || this.callLLM;

    const potentialQuery = await callLLM(
      messages,
      forceConfig.queryPrefix || this.baseQueryPrefix,
    );

    if (!potentialQuery) throw new Error('Could not get response from LLM');

    const cleanedQuery = this.getCleanQueryFromResponse(
      potentialQuery,
      forceConfig.queryPrefix,
    );

    return {
      queryPrefix: forceConfig.queryPrefix || this.baseQueryPrefix,
      partialQuery: cleanedQuery,
    };
  }

  getReflectionPrompt(
    history:
      | {
          type: 'regenerate';
          question: string;
          history?: QQTurn[];
          fewShotLearning?: QQTurn[];
        }
      | {
          type: 'fullHistory';
          messages: LLMCompatibleMessage[];
        },
    query: LLMQuery,
    error: string,
  ): LLMCompatibleMessage[] {
    const previousMessages =
      history.type === 'regenerate'
        ? this.generatePrompt(
            history.question,
            history.history,
            history.fewShotLearning,
          )
        : history.messages;

    const newMessages = [
      ...previousMessages,
      {
        role: 'assistant',
        content: query.queryPrefix + ' ' + query.partialQuery,
      } as LLMCompatibleMessage,
      {
        role: 'user',
        content: searchPrompt.reflection(error, query.queryPrefix),
      } as LLMCompatibleMessage,
    ];

    return newMessages;
  }

  async generateReflectedQuery(
    history:
      | {
          type: 'regenerate';
          question: string;
          history?: QQTurn[];
          fewShotLearning?: QQTurn[];
        }
      | {
          type: 'fullHistory';
          messages: LLMCompatibleMessage[];
        },
    query: LLMQuery,
    error: string,
    forceConfig: {
      callLLM?: LLMCallFunc;
    } = {},
  ): Promise<LLMQuery> {
    const messages = this.getReflectionPrompt(history, query, error);

    const callLLM = forceConfig.callLLM || this.callLLM;

    const potentialQuery = await callLLM(messages, query.queryPrefix);

    if (!potentialQuery)
      throw new Error('Could not get response from LLM for reflection');

    const cleanedQuery = this.getCleanQueryFromResponse(
      potentialQuery,
      query.queryPrefix,
    );

    return {
      queryPrefix: query.queryPrefix || this.baseQueryPrefix,
      partialQuery: cleanedQuery,
    };
  }
}
