// Trusted probe: only synthetic paths and an owned loopback listener.
import { writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
const target = process.argv[2], port = Number(process.argv[3]);
if (!target || !Number.isInteger(port)) process.exit(1);
let writeDenied = false;
try { await writeFile(target, 'probe'); } catch { writeDenied = true; }
const networkDenied = await new Promise<boolean>(resolve => {
  const socket = connect({ host: '127.0.0.1', port });
  const finish = (denied: boolean) => { socket.destroy(); resolve(denied); };
  socket.setTimeout(700, () => finish(true)); socket.once('error', () => finish(true));
  socket.once('connect', () => finish(false));
});
process.stdout.write(JSON.stringify({ writeDenied, networkDenied, hasCredential: !!process.env.ACCESS_TOKEN || !!process.env.OPENAI_API_KEY }));
