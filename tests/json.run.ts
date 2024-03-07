import { jsonStreamParser } from '../src/oboe-parser';

const jsonString = `
this is an example of a json string:
{
  "some": "json",
  "with": "stuff"
}

This is another output:
{
  "another": "json",
  "with": "things"
}
`;

async function run() {
  // split string into every 2 characters
  const splitJsonString = jsonString.match(/.{1,4}/g);
  async function* stringGenerator(splitString: string[]) {
    for await (const chunk of splitString) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      yield chunk;
    }
  }

  const parsed = jsonStreamParser(
    stringGenerator(splitJsonString!),
    (content) => content,
    {
      includeRaw: true,
      includeIntermediate: true,
    },
  );

  for await (const chunk of parsed) {
    console.log(chunk);
  }
}
run();
