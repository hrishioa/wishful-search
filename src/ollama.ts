function concatChunks(chunks: Uint8Array[], totalLength: number) {
  const concatenatedChunks = new Uint8Array(totalLength);

  let offset = 0;
  for (const chunk of chunks) {
    concatenatedChunks.set(chunk, offset);
    offset += chunk.length;
  }
  chunks.length = 0;

  return concatenatedChunks;
}

type OllamaStreamResponse = {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
};

export async function* callOllama(
  prompt: string,
  model: string,
  {
    port = 11434,
    temperature = 0,
    format,
  }: {
    port?: number;
    temperature?: number;
    format?: 'json';
  },
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
    model,
    prompt,
    format,
    options: {
      temperature,
    },
    stream: true,
  });

  // Using fetch to initiate a POST request that will return an SSE stream
  const response = await fetch(`http://127.0.0.1:${port}/api/generate`, {
    method: 'POST',
    headers: headers,
    body: requestBody,
  });
  if (response.ok) {
    const reader = response.body!.getReader();
    let completeMessage = '';

    const decoder = new TextDecoder();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (value) {
        chunks.push(value);
        totalLength += value.length;
        if (value[value.length - 1] !== '\n'.charCodeAt(0)) {
          // if the last character is not a newline, we have not read the whole JSON value
          continue;
        }
      }

      if (chunks.length === 0) {
        break;
      }

      const concatenatedChunks = concatChunks(chunks, totalLength);
      totalLength = 0;

      const streamParts = decoder
        .decode(concatenatedChunks, { stream: true })
        .split('\n')
        .filter((line) => line !== '') // splitting leaves an empty string at the end
        .map((o) =>
          JSON.parse(o.replace('data: ', '')),
        ) as OllamaStreamResponse[];
      for (const parts of streamParts) {
        completeMessage += parts.response;
        yield {
          type: 'token',
          token: parts.response,
        };
      }

      yield {
        type: 'completeMessage',
        message: completeMessage,
      };
    }
  } else {
    throw new Error(`Ollama fetch failed with status: ${response.status}`);
  }
}
