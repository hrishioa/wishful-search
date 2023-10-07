export async function* callOllama(
  rawPrompt: string,
  model: string,
  port: number = 11434,
  temperature: number = 0,
): AsyncGenerator<
  | {
      type: 'token';
      token: string;
    }
  | {
      type: 'completeMessage';
      message: string;
    },
  void,
  undefined
> {
  const headers = {
    'Content-Type': 'application/json',
  };

  const requestBody = JSON.stringify({
    model: model,
    template: rawPrompt,
    options: {
      temperature,
    },
  });

  // Using fetch to initiate a POST request that will return an SSE stream
  const response = await fetch(`http://localhost:${port}/api/generate`, {
    method: 'POST',
    headers: headers,
    body: requestBody,
  });

  if (response.ok) {
    const reader = response.body!.getReader();
    let textBuffer = '',
      completeMessage = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      // Append the new chunk to the existing buffer
      textBuffer += new TextDecoder().decode(value);

      // Attempt to parse all complete JSON objects in the buffer
      while (true) {
        const openingBraceIndex = textBuffer.indexOf('{');
        const closingBraceIndex = textBuffer.indexOf('}');

        // Check if we have a complete object
        if (openingBraceIndex !== -1 && closingBraceIndex !== -1) {
          // Extract and parse the JSON object
          const jsonString = textBuffer.slice(
            openingBraceIndex,
            closingBraceIndex + 1,
          );
          const parsedObject = JSON.parse(jsonString);

          if (!parsedObject.model)
            throw new Error(
              'Unrecognized response from ollama - missing model field',
            );

          if (parsedObject.response) {
            yield {
              type: 'token',
              token: parsedObject.response,
            };
            completeMessage += parsedObject.response;
          }

          if (parsedObject.done) {
            yield {
              type: 'completeMessage',
              message: completeMessage,
            };
            return;
          }

          console.log('New message:', parsedObject);

          // Remove the parsed object from the buffer
          textBuffer = textBuffer.slice(closingBraceIndex + 1);
        } else {
          // No complete JSON objects in buffer
          break;
        }
      }
    }
  } else {
    throw new Error(`Ollama fetch failed with status: ${response.status}`);
  }
}
