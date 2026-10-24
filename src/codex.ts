import type { RpcClient, SynthesisPort, SynthesisResult, Profile, SynthesisProgress } from './contracts.js';
import { record, exactKeys, textField, RelayError, checkAbort } from './errors.js';
import { emptyUsage, updateUsage } from './usage.js';
import { parseQuota } from './quota.js';
import { classifyProviderError } from './provider-errors.js';
export const responseInstructions = 'Return one JSON object with exactly kind, source, reason. For a correction: kind="candidate", source=the complete JavaScript module, reason="" (empty string, no explanation). If clarification is required: kind="needsInput", source="", reason=a short question. Never use tools. Do not add markdown fences.';
export const outputSchema = { type: 'object', properties: { kind: { type: 'string', enum: ['candidate', 'needsInput'] },
  source: { type: 'string', description: 'Complete JavaScript source for candidate; empty for needsInput.' },
  reason: { type: 'string', description: 'Must be the empty string for candidate; short clarification question for needsInput.' } }, required: ['kind', 'source', 'reason'], additionalProperties: false };
export function parseCandidate(value: unknown): { kind: 'candidate'; source: string } | { kind: 'needsInput'; reason: string } {
  const v = record(value); exactKeys(v, ['kind', 'source', 'reason']);
  if (typeof v.source !== 'string' || typeof v.reason !== 'string') throw new RelayError('inconclusive', 'Resposta estruturada inválida.');
  if (v.kind === 'candidate' && v.reason === '' && v.source.trim() && Buffer.byteLength(v.source) <= 64 * 1024)
    return { kind: 'candidate', source: v.source };
  if (v.kind === 'needsInput' && v.source === '' && v.reason.trim() && Buffer.byteLength(v.reason) <= 2048)
    return { kind: 'needsInput', reason: v.reason };
  throw new RelayError('inconclusive', 'Resposta inconsistente: candidate exige source e reason vazio; needsInput exige source vazio e reason. Limites: 64 KiB/2 KiB.');
}
export class CodexSynthesis implements SynthesisPort {
  private rpc: RpcClient | undefined;
  private active = false;
  private cleanupFailed = false;
  private stopping: Promise<void> | undefined;
  constructor(private readonly connect: (signal: AbortSignal) => Promise<RpcClient>, private readonly cwd: string,
    private readonly format: { instructions: string; schema: unknown } = { instructions: responseInstructions, schema: outputSchema }) {}
  async stop(): Promise<{ stopped: boolean }> {
    if (this.cleanupFailed) throw new RelayError('environment', 'Encerramento anterior não confirmado.');
    if (this.rpc) {
      const rpc = this.rpc;
      this.stopping ??= Promise.resolve().then(() => rpc.close()).then(() => {
        if (this.rpc === rpc) this.rpc = undefined;
      }, () => {
        this.cleanupFailed = true;
        throw new RelayError('environment', 'Não foi possível confirmar o encerramento da síntese.');
      });
      await this.stopping;
    }
    return { stopped: true };
  }
  async synthesize(profile: Profile, prompt: string, signal: AbortSignal, onProgress?: (event: SynthesisProgress) => void): Promise<SynthesisResult> {
    if (this.cleanupFailed) throw new RelayError('environment', 'Encerramento anterior não confirmado; síntese bloqueada.');
    if (this.active) throw new RelayError('integrity', 'Tentativa concorrente recusada.');
    checkAbort(signal); this.active = true;
    let unsubscribe = () => {};
    let observing = true;
    let quotaNotifications = 0;
    const progress = (event: SynthesisProgress) => { if (observing) try { onProgress?.(event); } catch { /* Observation cannot change synthesis. */ } };
    try {
      const rpc = await this.connect(signal); this.rpc = rpc; this.stopping = undefined;
      const started = record(await rpc.request('thread/start', { model: profile.model, cwd: this.cwd, ephemeral: true,
        approvalPolicy: 'never', sandbox: 'read-only', baseInstructions: this.format.instructions }, signal));
      const threadId = textField(record(started.thread).id);
      const result: SynthesisResult = { terminal: 'failed', reply: null, usage: emptyUsage(), threadId, turnId: null, observedModel: null, failure: 'inconclusive' };
      let turnId: string | undefined; let finalText: string | undefined; let lastError: unknown = null;
      const buffered: [string, unknown][] = []; let bufferedSize = 0;
      let resolveDone!: () => void; let rejectDone!: (error: unknown) => void;
      const done = new Promise<void>((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
      void done.catch(() => undefined);
      const accept = (method: string, raw: unknown) => {
        try {
          if (method === 'relay/closed') throw new RelayError('environment', 'Conexão interrompida antes do término.');
          if (method === 'relay/forbiddenRequest') throw new RelayError('scope', 'O modelo tentou solicitar ferramenta ou permissão.');
          if (method === 'account/rateLimits/updated') { quotaNotifications++; progress({ type: 'quota', quota: parseQuota(raw) }); return; }
          if (!['thread/tokenUsage/updated', 'model/rerouted', 'item/completed', 'item/started', 'turn/completed', 'error'].includes(method)) return;
          const p = record(raw);
          if (p.threadId !== threadId) return;
          if (!turnId) { bufferedSize += Buffer.byteLength(JSON.stringify(raw)); if (bufferedSize > 1024 * 1024) throw new RelayError('inconclusive', 'Eventos excederam o limite.'); buffered.push([method, raw]); return; }
          const eventTurnId = method === 'turn/completed' ? record(p.turn).id : p.turnId;
          if (eventTurnId !== turnId) return;
          if (method === 'error') { if (p.willRetry !== true) lastError = p.error; return; }
          if (method === 'thread/tokenUsage/updated') { result.usage = updateUsage(result.usage, record(p.tokenUsage).total); progress({ type: 'usage', usage: { ...result.usage } }); }
          if (method === 'model/rerouted') { result.observedModel = textField(p.toModel); progress({ type: 'model', model: result.observedModel }); }
          if (method === 'item/completed' || method === 'item/started') {
            const item = record(p.item);
            if (item.type === 'agentMessage' && method === 'item/completed') {
              if (typeof item.text !== 'string' || Buffer.byteLength(item.text) > 96 * 1024 || finalText !== undefined) throw new RelayError('inconclusive', 'Saída final inválida.');
              finalText = item.text;
            } else if (!['agentMessage', 'reasoning', 'userMessage'].includes(String(item.type))) throw new RelayError('scope', 'Item de ferramenta recusado.');
          }
          if (method === 'turn/completed') {
            const turn = record(p.turn);
            if (!['completed', 'failed', 'interrupted'].includes(String(turn.status))) throw new Error();
            result.terminal = turn.status as SynthesisResult['terminal'];
            if (result.terminal === 'completed') { result.reply = JSON.parse(finalText ?? 'null'); result.failure = null; }
            else if (result.terminal === 'interrupted') result.failure = 'cancelled';
            else { const diagnostic = classifyProviderError(turn.error ?? lastError); result.failure = diagnostic.kind; result.providerFailure = diagnostic; }
            resolveDone();
          }
        } catch (error) { rejectDone(error instanceof RelayError ? error : new RelayError('inconclusive', 'Evento inválido do modelo.')); }
      };
      unsubscribe = rpc.onNotification(accept);
      if (onProgress) void rpc.request('account/rateLimits/read', {}, signal)
        .then(raw => { if (!quotaNotifications) progress({ type: 'quota', quota: parseQuota(raw) }); })
        .catch(() => { if (!quotaNotifications) progress({ type: 'quota', quota: parseQuota(null) }); });
      const abort = () => rejectDone(new RelayError(signal.reason?.name === 'TimeoutError' ? 'limit' : 'cancelled', 'Síntese interrompida.'));
      signal.addEventListener('abort', abort, { once: true });
      try {
        checkAbort(signal);
        const turn = record(await rpc.request('turn/start', { threadId, model: profile.model, effort: profile.effort,
          input: [{ type: 'text', text: prompt, text_elements: [] }], outputSchema: this.format.schema }, signal));
        turnId = textField(record(turn.turn).id); result.turnId = turnId;
        for (const event of buffered) accept(...event);
        await done;
      } finally { signal.removeEventListener('abort', abort); }
      return result;
    } finally { observing = false; unsubscribe(); try { await this.stop(); } finally { this.active = false; } }
  }
}
