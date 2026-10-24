import { StringDecoder } from 'node:string_decoder';
import type { RpcClient } from './contracts.js';
import type { ProcessOwner } from './processes.js';
import { checkAbort, record, RelayError } from './errors.js';
import { classifyProviderError } from './provider-errors.js';
type Pending = { resolve(value: unknown): void; reject(error: unknown): void; cleanup(): void };
export class JsonlRpc implements RpcClient {
  private nextId = 0;
  private pending = new Map<number, Pending>();
  private listeners = new Set<(method: string, params: unknown) => void>();
  private buffer = '';
  private decoder = new StringDecoder('utf8');
  private broken: RelayError | undefined;
  constructor(readonly owner: ProcessOwner) {
    owner.child.stdout.on('data', (chunk: Buffer) => {
      try {
        this.buffer += this.decoder.write(chunk);
        let end: number;
        while ((end = this.buffer.indexOf('\n')) >= 0) {
          const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1);
          if (Buffer.byteLength(line) > 1024 * 1024) throw new Error();
          if (line.trim()) this.accept(JSON.parse(line));
        }
        if (Buffer.byteLength(this.buffer) > 1024 * 1024) throw new Error();
      } catch { this.fail(new RelayError('inconclusive', 'Mensagem inválida recebida do App Server.')); }
    });
    owner.child.stdin.on('error', () => this.fail(new RelayError('environment', 'Entrada do App Server foi fechada.')));
    void owner.exited.then(() => this.fail(new RelayError('environment', 'App Server encerrou a conexão.')));
  }
  private accept(value: unknown): void {
    const message = record(value);
    if (typeof message.method === 'string') {
      if ('id' in message) {
        // No server-initiated tool/approval is authorized in this prototype.
        this.write({ id: message.id, error: { code: -32601, message: 'Relay refuses tools and permission requests' } });
        for (const listener of this.listeners) listener('relay/forbiddenRequest', { method: message.method });
      } else for (const listener of this.listeners) listener(message.method, message.params);
      return;
    }
    if (typeof message.id !== 'number') throw new Error();
    const pending = this.pending.get(message.id);
    if (!pending) throw new Error();
    this.pending.delete(message.id); pending.cleanup();
    if ('error' in message) {
      const diagnostic = classifyProviderError(message.error);
      pending.reject(diagnostic.reason === 'unknown'
        ? new RelayError('environment', 'Pedido recusado pelo App Server; verifique versão e política.')
        : new RelayError(diagnostic.kind, diagnostic.message, diagnostic));
    }
    else if ('result' in message) pending.resolve(message.result);
    else { pending.reject(new RelayError('inconclusive', 'Resposta sem resultado.')); throw new Error(); }
  }
  private fail(error: RelayError): void {
    this.broken ??= error;
    for (const pending of this.pending.values()) { pending.cleanup(); pending.reject(this.broken); }
    this.pending.clear();
    for (const listener of this.listeners) listener('relay/closed', { kind: error.kind });
  }
  private write(message: unknown): void {
    if (this.broken) throw this.broken;
    this.owner.child.stdin.write(JSON.stringify(message) + '\n');
  }
  request(method: string, params: unknown, signal: AbortSignal): Promise<unknown> {
    try { checkAbort(signal); if (this.broken) throw this.broken; } catch (error) { return Promise.reject(error); }
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const abort = () => { this.pending.delete(id); reject(new RelayError(signal.reason?.name === 'TimeoutError' ? 'limit' : 'cancelled', 'Pedido interrompido.')); };
      this.pending.set(id, { resolve, reject, cleanup: () => signal.removeEventListener('abort', abort) });
      signal.addEventListener('abort', abort, { once: true });
      try { this.write({ id, method, params }); }
      catch (error) { this.pending.delete(id); signal.removeEventListener('abort', abort); reject(error); }
    });
  }
  notify(method: string, params: unknown): void { this.write({ method, params }); }
  onNotification(listener: (method: string, params: unknown) => void): () => void {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  }
  async close(): Promise<void> {
    this.fail(new RelayError('cancelled', 'Conexão encerrada.'));
    await this.owner.stop();
  }
}
