import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { JsonlRpc } from './rpc.js';
import { ownProcess } from './processes.js';
import { record, RelayError } from './errors.js';
export const RELAY_VERSION = '0.0.0';
export const VERIFIED_CODEX = '0.164.0-alpha.11.1';
export interface ServerOptions { home: string; cwd: string; accessToken?: string }
export function serverArgs(withToken: boolean): string[] {
  const args = ['app-server', '--listen', 'stdio://', '--strict-config'];
  // Explicit MXC fails closed on unsupported hosts and never starts legacy setup.
  if (process.platform === 'win32') args.push('-c', 'windows.sandbox="mxc"');
  for (const feature of ['shell_tool', 'apps', 'plugins', 'remote_plugin', 'multi_agent', 'multi_agent_v2'])
    args.push('--disable', feature);
  for (const setting of ['analytics.enabled=false', 'memories.generate_memories=false', 'memories.use_memories=false',
    'web_search="disabled"', 'project_doc_max_bytes=0']) args.push('-c', setting);
  if (withToken) for (const setting of [
    'model_provider="openai_chatgpt_plan"', 'model_providers.openai_chatgpt_plan.name="ChatGPT plan"',
    'model_providers.openai_chatgpt_plan.base_url="https://api.openai.com/v1"',
    'model_providers.openai_chatgpt_plan.env_key="ACCESS_TOKEN"',
    'model_providers.openai_chatgpt_plan.wire_api="responses"',
    'model_providers.openai_chatgpt_plan.requires_openai_auth=false',
    'model_providers.openai_chatgpt_plan.supports_websockets=false',
  ]) args.push('-c', setting);
  return args;
}
export async function startServer(options: ServerOptions, signal: AbortSignal): Promise<JsonlRpc> {
  await mkdir(options.home, { recursive: true });
  const env: NodeJS.ProcessEnv = { CODEX_HOME: resolve(options.home) };
  if (options.accessToken) env.ACCESS_TOKEN = options.accessToken;
  const owner = ownProcess('codex', serverArgs(!!options.accessToken), { cwd: options.cwd, env, treeRequired: true });
  const rpc = new JsonlRpc(owner);
  try {
    record(await rpc.request('initialize', { clientInfo: { name: 'Relay', title: 'Relay', version: RELAY_VERSION }, capabilities: { experimentalApi: false } }, AbortSignal.any([signal, AbortSignal.timeout(10_000)])));
    rpc.notify('initialized', {});
    return rpc;
  } catch (error) { await rpc.close(); throw error; }
}
export async function readRequirements(rpc: JsonlRpc, signal: AbortSignal): Promise<unknown> {
  const result = record(await rpc.request('configRequirements/read', {}, signal));
  if (!('requirements' in result)) throw new RelayError('environment', 'Protocolo de requisitos incompatível.');
  return result.requirements;
}
