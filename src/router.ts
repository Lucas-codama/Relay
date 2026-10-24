import type { RelayConfig } from './contracts.js';
import type { CatalogModel } from './models.js';
import type { ProjectSnapshot, Route, RouteLevel } from './project-types.js';
export function routes(config: RelayConfig, catalog: readonly CatalogModel[]): Route[] {
  const economical = config.profiles.economico;
  const supported = catalog.find(m => m.model === economical.model)?.efforts ?? [economical.effort];
  const order = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
  const middle = supported.find(e => e === 'medium' && order.indexOf(e) > order.indexOf(economical.effort)) ??
    supported.find(e => e === 'high' && order.indexOf(e) > order.indexOf(economical.effort));
  const result: Route[] = [{ level: 'light', profile: economical, reason: 'Tarefa localizada; começar com capacidade econômica.' }];
  if (middle) result.push({ level: 'standard', profile: { model: economical.model, effort: middle }, reason: 'Aumentar raciocínio antes de trocar para o modelo robusto.' });
  result.push({ level: 'deep', profile: config.profiles.robusto, reason: 'Capacidade robusta para maior risco ou falha persistente.' });
  return result;
}
export function classify(prompt: string, snapshot: ProjectSnapshot, available: readonly Route[], previousFailures = 0): Route {
  const text = prompt.toLowerCase();
  const risk = /autentica|oauth|\blogin\b|\bsenha\b|password|token de sess|criptograf|pagamento|migration|migra[çc][aã]o|seguran[çc]a|security|concorr[eê]ncia|race condition|arquitetura|arquitetur|refator.*(?:inteir|global)/.test(text);
  const debugging = /n[aã]o.{0,35}(?:funcion|consig|conseg|clic|respond)|\bbug\b|\berro\b|falha|quebrad|travand/.test(text);
  const repeated = debugging && /ainda|continua|novamente|de novo|outra vez/.test(text);
  const filesMentioned = snapshot.files.filter(f => text.includes(f.path.toLowerCase())).length;
  const broad = /(?:v[aá]rios|m[uú]ltiplos) (?:servi[çc]os|sistemas)|distributed|microservi|integra[çc][aã]o.*(?:banco|extern)/.test(text);
  const level: RouteLevel = risk || broad || repeated || filesMentioned > 6 ? 'deep' :
    debugging || previousFailures > 0 || prompt.length > 1800 || filesMentioned > 2 ? 'standard' : 'light';
  const route = available.find(r => r.level === level) ?? available.at(-1)!;
  return { ...route, reason: risk ? 'Risco de segurança/dados: começar com capacidade robusta evita tentativas frágeis.' :
    repeated ? 'Falha persistente: diagnosticar com maior capacidade.' : debugging ? 'Diagnosticar a causa antes de alterar arquivos.' :
    broad || filesMentioned > 6 ? 'Mudança ampla com várias dependências.' : previousFailures ? 'Histórico local de falha em pedido semelhante.' : route.reason };
}
export function nextRoute(current: Route, available: readonly Route[]): Route | null {
  const index = available.findIndex(r => r.level === current.level);
  return available[index + 1] ?? null;
}
