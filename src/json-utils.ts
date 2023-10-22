/**
 * Why do these functions exist?
 * Ostensibly, YAML is better. However, across different models,
 * YAML performance is - to put it lightly - mixed and inconsistent.
 * Also adds a dependency and makes bundling it difficult.
 * XML is only good for some models, and the cost of parsing it is
 * a giant pain.
 * JSON - with the token costs of fixing it - is what works for now.
 */

import { LLMCallFunc, LLMCompatibleMessage } from './types';

// prettier-ignore
const jsonFixPrompts = {
  system:
`You can only return valid JSON.`,
  user: (error:string, invalidJSON: string) =>
`
Error: ${error}

Fix this invalid JSON and return perfectly valid JSON without changing any content:

\'\'\'json
${invalidJSON}
\'\'\'
`
}

const jsonFixExamples = [
  {
    invalidJSONStr: `type Analysis = {
  suitabilityDesc: "The top result included a layover which does not match a direct flight.",
  suitability: 0.3,
  desires: ["A non-stop flight", "No layovers"],
}`,
    error: `Uncaught SyntaxError: Unexpected token 'y', "type Analys"... is not valid JSON`,
    fixedJSONStr: `{
  "suitabilityDesc": "The top result included a layover which does not match a direct flight.",
  "suitability": 0.3,
  "desires": ["A non-stop flight", "No layovers"],
}`,
  },
  {
    invalidJSONStr: `{abc:2}`,
    error: `Uncaught SyntaxError: Expected property name or '}' in JSON at position 1`,
    fixedJSONStr: `{"abc":2}`,
  },
];

export async function fixJSON(callLLM: LLMCallFunc, jsonStr: string) {
  try {
    const parsedJSON = JSON.parse(jsonStr);

    return parsedJSON;
  } catch (err: any) {
    const messages: LLMCompatibleMessage[] = [
      {
        content: jsonFixPrompts.system,
        role: 'system',
      },
    ];

    // for each example add messages
    for (const example of jsonFixExamples) {
      messages.push({
        content: jsonFixPrompts.user(example.error, example.invalidJSONStr),
        role: 'user',
      });
      messages.push({
        role: 'assistant',
        content: example.fixedJSONStr,
      });
    }

    messages.push({
      role: 'user',
      content: jsonFixPrompts.user(err.toString(), jsonStr),
    });

    const fixedJSON = await callLLM(messages);

    if (!fixedJSON) {
      return null;
    }

    return JSON.parse(fixedJSON);
  }
}
