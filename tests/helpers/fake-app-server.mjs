import { createInterface } from 'node:readline';
const mode = process.argv[2];
if (mode === 'early') process.exit(0);
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  if (mode === 'hang') continue;
  const result = JSON.stringify({ id: request.id, result: { echo: request.params } }) + '\n';
  if (mode === 'invalid') process.stdout.write('not-json\n');
  else if (mode === 'duplicate') process.stdout.write(result + result);
  else if (mode === 'split') {
    process.stdout.write(result.slice(0, 3));
    await new Promise(resolve => setTimeout(resolve, 10));
    process.stdout.write(result.slice(3, 7));
    process.stdout.write(result.slice(7) + '{"method":"optional/new","params":{}}\n');
  } else process.stdout.write(result);
}
