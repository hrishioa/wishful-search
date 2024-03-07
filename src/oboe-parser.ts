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
      const content = contentParser(chunk);
      if (content !== undefined) {
        if (content.includes('{')) {
          const beforeBracket = content.slice(0, content.indexOf('{'));
          const afterBracket = content.slice(content.indexOf('{'));

          if (includeRaw) {
            if (!start) {
              returnStream.write({
                type: 'notJsonToken',
                notJsonToken: beforeBracket,
              });
            } else {
              returnStream.write({
                type: 'token',
                token: beforeBracket,
              });
            }
          }
          if (start) {
            fullMessage += beforeBracket;
            this.push(beforeBracket);
          }
          if (!start) {
            start = true;
            returnStream.write({
              type: 'startJson',
            });
          }
          if (includeRaw) {
            if (!start) {
              returnStream.write({
                type: 'notJsonToken',
                notJsonToken: afterBracket,
              });
            } else {
              returnStream.write({
                type: 'token',
                token: afterBracket,
              });
            }
          }
          if (start) {
            fullMessage += afterBracket;
            this.push(afterBracket);
          }
        } else if (content.includes('}')) {
          const beforeBracket = content.slice(0, content.indexOf('}') + 1);
          const afterBracket = content.slice(content.indexOf('}') + 1);

          if (includeRaw) {
            if (!start) {
              returnStream.write({
                type: 'notJsonToken',
                notJsonToken: beforeBracket,
              });
            } else {
              returnStream.write({
                type: 'token',
                token: beforeBracket,
              });
            }
          }
          if (start) {
            fullMessage += beforeBracket;
            this.push(beforeBracket);
          }
          if (includeRaw) {
            if (!start) {
              returnStream.write({
                type: 'notJsonToken',
                notJsonToken: afterBracket,
              });
            } else {
              returnStream.write({
                type: 'token',
                token: afterBracket,
              });
            }
          }
          if (start) {
            fullMessage += afterBracket;
            this.push(afterBracket);
          }
        } else {
          if (includeRaw) {
            if (!start) {
              returnStream.write({
                type: 'notJsonToken',
                notJsonToken: content,
              });
            } else {
              returnStream.write({
                type: 'token',
                token: content,
              });
            }
          }
          fullMessage += content;
          if (start) {
            this.push(content);
          }
        }
      }

      callback();
    },
  });

  oboe(mainStream.pipe(transformStream))
    .path('.*', function (value, path) {
      if (includeIntermediate) {
        if (path.length && !returnStream.destroyed) {
          returnStream.write({
            type: 'childStart',
            childStart: {
              path,
              value,
            },
          });
        }
      }
    })
    .node('.*', function (value, path) {
      if (includeIntermediate) {
        if (path.length && !returnStream.destroyed) {
          returnStream.write({
            type: 'childEnd',
            childEnd: {
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
      start = false;
      returnStream.write({
        type: 'stopJson',
      });
      returnStream.write({
        type: 'completeJSON',
        completeJSON: JSON.parse(JSON.stringify(completeJSON)),
      });
      !includeRaw && returnStream.end();
    });

  includeRaw &&
    mainStream.on('end', () => {
      console.log('Stream ended');
      returnStream.end();
    });

  for await (const chunk of returnStream) {
    yield chunk;
  }
}
