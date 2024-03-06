import oboe from 'oboe';
import { PassThrough, Readable, Transform } from 'stream';

export async function* jsonStreamParser<T>(
  stream: AsyncIterable<T> | AsyncGenerator<T, void, unknown>,
  contentParser: (content: T) => string,
  props:
    | {
        includeIntermediate?: boolean;
        includeRaw?: boolean;
      }
    | undefined,
) {
  const { includeIntermediate = false, includeRaw = false } = props || {};
  let fullMessage = '',
    start: boolean = false,
    complete: boolean = false;
  const mainStream = Readable.from(stream);
  const returnStream = new PassThrough({ objectMode: true });

  const transformStream = new Transform({
    objectMode: true,
    transform(chunk, encoding, callback) {
      let tokenData = '';
      const content = contentParser(chunk);
      if (includeRaw) {
        if (!complete) {
          returnStream.write({
            type: 'token',
            token: content,
          });
        }
      }
      if (content !== undefined) {
        if (!start) {
          if (content.includes('{')) start = true;
        }
        if (start) {
          fullMessage += content;
          tokenData += content;
        }
      }

      if (tokenData) this.push(tokenData);
      callback();
    },
  });

  oboe(mainStream.pipe(transformStream))
    .node('.*', function (value, path) {
      if (includeIntermediate) {
        if (path.length && !returnStream.destroyed) {
          returnStream.write({
            type: 'intermediate',
            intermediate: {
              path,
              value,
            },
          });
        }
      }
    })
    // .fail(function (error) {
    //   console.log('Oboe failed', error);
    // })
    .done(function (completeJSON) {
      complete = true;
      returnStream.write({
        type: 'completeJSON',
        completeJSON: JSON.parse(JSON.stringify(completeJSON)),
      });
      !includeRaw && returnStream.end();
    });

  includeRaw &&
    mainStream.on('end', () => {
      returnStream.end();
    });

  for await (const chunk of returnStream) {
    yield chunk;
  }
}
