import { createInterface } from "readline";

export const question = (questionText: string) => {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<string>((resolve) =>
    rl.question(questionText, resolve)
  ).finally(() => rl.close());
};