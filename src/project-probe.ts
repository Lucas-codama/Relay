import { readFile, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
let readDenied = false, writeDenied = false;
try { await readFile(process.argv[2]!); } catch { readDenied = true; }
try { await writeFile('relay-probe-should-deny', 'x'); } catch { writeDenied = true; }
const networkDenied = await new Promise<boolean>(resolve => {
  const socket = connect({ host: '127.0.0.1', port: Number(process.argv[3]) });
  const finish = (denied: boolean) => { socket.destroy(); resolve(denied); };
  socket.once('error', () => finish(true)); socket.once('connect', () => finish(false)); socket.setTimeout(700, () => finish(true));
});
process.stdout.write(JSON.stringify({ readDenied, writeDenied, networkDenied, hasCredential: !!process.env.ACCESS_TOKEN || !!process.env.OPENAI_API_KEY }));
