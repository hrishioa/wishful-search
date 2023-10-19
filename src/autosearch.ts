import { AnalysisTypespec, AutoSearchHistoryElement, LLMCompatibleMessage } from './types';

const autoSearchPrompts = {
  system: (ddlStr: string) =>
`You can only return valid JSON.

Information is stored in tables with this schema:
\`\`\`
${ddlStr}
\`\`\``
  , user: (userQuestion: string, history: AutoSearchHistoryElement[]) =>
`The user had this USER_QUESTION: ${userQuestion}

We tried the following modified questions, and got these queries and results:

${history.map((h, i) => ` - ${i+1}: \"${h.question}\" generated \"${h.query}\" which returned ${h.results.count} results with top prettified result \"${h.results.topResultStr}\". ${h.suitabilityDesc ? `Suitability was ${h.suitabilityScore} (${h.suitabilityDesc}` : ''}`).join('\n')}

We can improve the results by looking for ways to increase suitability. Check for patterns (like consistent no resutls, same result over again, etc). Return your analysis following this typespec, and be exhaustive and thorough.

\'\'\'typescript
${AnalysisTypespec}
\`\`\`

Valid JSON:`
  };

export function generateAutoSearchMessages(strDDL: string, userQuestion: string, history: AutoSearchHistoryElement[]) {
  const analysisMessages: LLMCompatibleMessage[] = [
    {
      content: autoSearchPrompts.system(strDDL),
      role: 'system',
    },
    {
      content: autoSearchPrompts.user(userQuestion, history),
      role: 'user',
    },
  ];

  return analysisMessages;
}