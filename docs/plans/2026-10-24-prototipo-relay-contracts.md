# Relay: contratos executáveis e casos do primeiro protótipo

Status: anexo do [plano aprovado](2026-10-24-prototipo-relay-plan.md).
Segue o [desenho aprovado](2026-10-24-prototipo-relay-design.md). A implementação
agora existe em src/; este anexo preserva a especificação, com ajustes abaixo.

Ajustes de integração: RunOptions inclui prompt e maxTurns opcionais (1 ou 2;
somente reduz o teto); RunReport contém baseline;
saveReport recebe stateRoot explícito; módulos auxiliares app-server/cases/errors/
doctor/models e testes correspondentes separam responsabilidades. MXC é exigido
explicitamente sem fallback/provisionamento; lock usa handle Windows liberado
pelo SO, sem arquivos órfãos bloqueantes. Consulte setup para validação real.

## 1. Fundação TypeScript proposta

`package.json` inicial, privado para evitar publicação acidental do protótipo:

```json
{
  "name": "relay-prototype",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24.18.0 <25" },
  "bin": { "relay": "dist/src/cli.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "npm run build && node --test --test-concurrency=1 \"dist/tests/*.test.js\"",
    "test:native": "npm run build && node --test --test-concurrency=1 \"dist/tests-native/*.test.js\"",
    "check": "npm run typecheck && npm test && pwsh -NoProfile -File scripts/check.ps1",
    "doctor": "node dist/src/cli.js doctor"
  },
  "dependencies": { "jose": "6.2.13", "quickjs-emscripten": "0.32.0" },
  "devDependencies": { "@types/node": "24.19.2", "typescript": "7.0.2" }
}
```

Versões consultadas no registro público em 2026-10-24. Os tipos seguem a linha
Node 24; não substituem testes no runtime real 24.18.0. Instalação futura usa
`npm install --ignore-scripts`, registra `package-lock.json`, licenças e auditoria;
se algum pacote exigir script nativo, interromper para revisar, não habilitar
scripts globalmente. `dist/` e `*.tsbuildinfo` entram no .gitignore; não ignorar
testes nem o lockfile. Instalação global e `npm link` não são necessários.

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023", "module": "NodeNext", "moduleResolution": "NodeNext",
    "rootDir": ".", "outDir": "dist", "strict": true,
    "noUncheckedIndexedAccess": true, "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true, "noEmitOnError": true,
    "forceConsistentCasingInFileNames": true, "types": ["node"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "tests-native/**/*.ts"]
}
```

## 2. Tipos de domínio em src/contracts.ts

```typescript
export type ProfileName = 'economico' | 'robusto';
export interface Profile { model: string; effort: string }
export interface RelayConfig {
  version: 1;
  profiles: Record<ProfileName, Profile>;
}
export type FailureKind =
  | 'implementation' | 'environment' | 'access' | 'scope'
  | 'inconclusive' | 'limit' | 'cancelled' | 'integrity';
export interface Usage {
  input: number | null; cachedInput: number | null;
  output: number | null; reasoningOutput: number | null;
  total: number | null;
}
export type RunMode = 'adaptive' | 'reference';
export interface Versions { relay: string; node: string; codex: string }
export interface AttemptResult {
  localId: string;
  versions: Versions;
  durationMs: number;
  profile: ProfileName;
  status: 'passed' | 'failed';
  failure: FailureKind | null;
  diagnostic: string;
  threadId: string | null;
  turnId: string | null;
  requested: Profile;
  observedModel: string | null;
  usage: Usage;
  verification: Verification | null;
  diffArtifact: string | null;
}
export type Decision =
  | { action: 'complete' }
  | { action: 'run'; profile: ProfileName }
  | { action: 'stop'; reason: FailureKind };
export interface Verification {
  status: 'passed' | 'failed';
  failure: FailureKind | null;
  cases: number;
  results: { id: string; status: 'passed' | 'failed'; diagnostic: string }[];
  diagnostic: string;
}
```

Assinaturas públicas a implementar:

```typescript
export function decide(results: readonly AttemptResult[], remainingMs: number, mode?: RunMode): Decision;
export function parseConfig(value: unknown): RelayConfig;
export function parseCandidate(value: unknown):
  { kind: 'candidate'; source: string } | { kind: 'needsInput'; reason: string };
export function updateUsage(previous: Usage, snapshot: unknown): Usage;
export function readConfig(path: string): Promise<RelayConfig>;
export function createVerifier(sandbox: SandboxPort): Verifier;
export function createFixture(): Promise<{ root: string; sourcePath: string; initialHash: string }>;
```

Distribuição: decide em policy.ts; parseConfig/readConfig em config.ts;
parseCandidate em codex.ts; updateUsage em usage.ts; createVerifier em verify.ts;
createFixture em fixture.ts. contracts.ts contém somente tipos compartilhados.

Contratos adicionais de integração:

```typescript
export interface RpcClient {
  request(method: string, params: unknown, signal: AbortSignal): Promise<unknown>;
  notify(method: string, params: unknown): void;
  onNotification(listener: (method: string, params: unknown) => void): () => void;
  close(): Promise<void>;
}
export interface CredentialRecord {
  registrationId: string;
  issuer: string; subject: string; clientId: string; hostId: string;
  accessToken: string; refreshToken: string; idToken: string;
  expiresAt: number; scopes: string[];
}
export interface SessionStore {
  listRegistrations(): Promise<{ id: string; label: string }[]>;
  read(registrationId: string): Promise<CredentialRecord | null>;
  write(record: CredentialRecord): Promise<void>;
  withLock<T>(registrationId: string, fn: () => Promise<T>): Promise<T>;
}
export interface SynthesisResult {
  terminal: 'completed' | 'failed' | 'interrupted';
  reply: unknown; usage: Usage; threadId: string | null; turnId: string | null;
  observedModel: string | null; failure: FailureKind | null;
}
export interface SynthesisPort {
  synthesize(profile: Profile, prompt: string, signal: AbortSignal): Promise<SynthesisResult>;
  stop(): Promise<{ stopped: boolean }>;
}
export interface SandboxPort {
  run(source: string, signal: AbortSignal): Promise<unknown>;
}
export interface Verifier {
  verify(source: string, signal: AbortSignal): Promise<Verification>;
}
export interface RunOptions {
  mode: RunMode;
  versions: Versions;
  now: () => number;
}
export interface RunReport {
  version: 1; status: 'passed' | 'failed'; failure: FailureKind | null;
  mode: RunMode; versions: Versions; initialHash: string;
  attempts: AttemptResult[]; durationMs: number; totalUsage: Usage;
}
```

`auth.ts` exporta ensureSession(store, registrationId, signal): Promise<CredentialRecord>;
registrationId é string ou null para novo consentimento. `sandbox.ts` implementa
SandboxPort, devolvendo somente dados do runner. `controller.ts` exporta
runDemo(config, synthesis, verifier, options, signal): Promise<RunReport>.
`report.ts` exporta renderReport(report): string e
saveReport(report): Promise<string>. Saídas usam campos conhecidos, nunca
JSON.stringify de sessão/erro bruto.

registrationId é SHA-256 da codificação JSON canônica da tripla validada
[issuer, subject, clientId]; não usar email nem clientId isolado como chave.
O store confere esse vínculo a cada leitura/escrita e recusa substituição de
identidade. Listagem retorna somente ID opaco e rótulo local escolhido, sem claims
ou tokens. Com vários registros, CLI exige seleção explícita antes da renovação;
não troca conta após falha. Dados do registro e índice ficam no estado protegido.

O relógio injetado mede milissegundos monotônicos; produção usa performance.now().
O modo vem apenas da opção confiável do CLI: adaptive começa economico e pode
escalar uma vez; reference começa robusto e termina após uma tentativa, mesmo
em implementation. Relatórios são separados por modo e vinculados pelo initialHash.
Cada tentativa guarda versões, duração, verificação e referência opaca ao diff
local; artefato deve existir dentro da cópia própria, sem caminho absoluto ou
conteúdo de fonte no log. Sem candidato aplicado/verificado, os campos são null.
Verificação inclui resultados sanitizados de cada caso executado, não só exit code.

Fixtures .mjs e windows-store.ps1 são assets conhecidos, não compilados pelo tsc.
Resolver assets de dist/src por URL relativa à raiz do pacote, por exemplo
`new URL('../../src/windows-store.ps1', import.meta.url)`. Testes usam o helper
original em tests/helpers por caminho absoluto resolvido da raiz npm do projeto.

`decide` é puro e assume adaptive quando mode está ausente. Sucesso confirmado
dentro do prazo permanece complete; orçamento esgotado impede nova tentativa.
`parseConfig` recusa campos desconhecidos, strings vazias,
combinações idênticas e nomes fora de dois perfis. Catalogar não é provar acesso.
`parseCandidate` recusa JSON com chaves extras, objetos/prototypes inesperados,
fonte vazia ou maior que 64 KiB UTF-8, e reason maior que 2 KiB. A fonte é tratada
como dados até entrar no interpretador isolado; nunca usar eval/import do Node.

`Usage.cachedInput` pertence a input; reasoningOutput pertence a output. Não somar
subcategorias para obter total. Se não vier total, mantê-lo null. Snapshots de um
mesmo turno substituem o anterior, não se somam; por múltiplos turnos, qualquer
parcela ausente mantém o agregado correspondente null. Valores inválidos ou
negativos são descartados como indisponíveis, sem fabricar zero.

## 3. Caso de desconto e valores exatos

Arquivo editável único da cópia: `discount.mjs`, exportação síncrona
`calculateDiscount(amount, percent)`. Dois argumentos devem ser números finitos,
amount >= 0 e 0 <= percent <= 100. Invalidade lança TypeError. Retorno deve ser
número finito igual a `amount * (1 - percent / 100)` com tolerância absoluta
1e-9; não há arredondamento monetário. A função não recebe objetos mutáveis.

Versão inicial intencionalmente defeituosa de `fixtures/discount/discount.mjs`:

```javascript
export function calculateDiscount(amount, percent) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 ||
      typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new TypeError('Invalid input');
  }
  return amount * (1 - Math.floor(percent / 100));
}
```

A referência só troca a última linha por `return amount * (1 - percent / 100);`.
Referência, contrato e casos pertencem ao verificador, fora da cópia editável.
Esperado para a baseline: controles de limite/invalidade passam; descontos
fracionários falham. A referência deve passar em todos os casos abaixo.

| Caso | amount | percent | Esperado |
| --- | --- | --- | --- |
| zero-amount | 0 | 25 | 0 |
| zero-percent | 100 | 0 | 100 |
| full-percent | 100 | 100 | 0 |
| partial | 200 | 25 | 150 |
| fractional | 99.9 | 12.5 | 87.4125 |
| small | 0.1 | 50 | 0.05 |
| negative-amount | -1 | 10 | TypeError |
| negative-percent | 100 | -1 | TypeError |
| excess-percent | 100 | 101 | TypeError |
| string-amount | "100" | 10 | TypeError |
| string-percent | 100 | "10" | TypeError |
| null-amount | null | 10 | TypeError |
| absent-percent | 100 | undefined | TypeError |
| nan-amount | NaN | 10 | TypeError |
| infinite-percent | 100 | Infinity | TypeError |

Representar undefined/NaN/Infinity no IPC com tags explícitas criadas pelo runner
confiável, não com JSON.parse transformado em código. Não passar expected ao
processo candidato. Comparações e contagem obrigatória dos 15 casos ficam no host.

## 4. Isolamento concreto do avaliador

Implementar `src/runner.ts` e `src/sandbox.ts`: processo Node descartável contendo
QuickJS compilado em WebAssembly; o candidato executa dentro desse interpretador,
nunca no contexto Node. Sem bindings de host, console, process, require, fetch,
rede, fs ou carregamento de módulos. Um novo runtime/contexto é criado por caso.
Usar `getQuickJS()`, `newRuntime()`, `setMemoryLimit(16 * 1024 * 1024)`,
`setMaxStackSize(512 * 1024)` e `setInterruptHandler` com deadline por caso.
Avaliar source como módulo, extrair a exportação e chamá-la pelo handle QuickJS.
Negar o module loader; rejeitar promessa/retorno não numérico. Liberar handles,
contexto e runtime em finally; nunca serializar o heap inteiro.

Defesa adicional no Windows: invocar o runner conhecido por `command/exec` em
um App Server auxiliar sem autenticação, sem turnos, ambiente mínimo e sandbox
readOnly/networkAccess=false. `command` é um vetor fixo com process.execPath,
`--max-old-space-size=96` e o caminho absoluto do runner compilado. stdin recebe
fonte/casos codificados; stdout é JSON limitado a 16 KiB. Não usar process/spawn
do protocolo, shellCommand, externalSandbox, Node vm, ou permission flags como
substitutos dessa fronteira. Nenhum daemon ou serviço é instalado.

O auxiliar usa uma pasta temporária própria de estado Codex, sem copiar auth,
config ou plugins pessoais. Consultar requirements efetivos; requisitos gerenciados
continuam obrigatórios. Comparar restrições com a execução nativa antes de usar
o auxiliar. Se o isolamento/configuração exigido não puder ser aplicado, parar
como environment; não provisionar contas, firewall ou ACLs de máquina implicitamente.

`command/exec` usa processId próprio, timeoutMs=20000, outputBytesCap=16384 e
streamStdin=true. O deadline do host é mínimo entre 20 s e tempo restante global.
Cada caso tem 5 s. EOF antes dos 15 resultados, erro do processo ou limite impede
aprovação mesmo com exitCode=0. Cancelamento usa command/exec/terminate e confirma
o término; sem confirmação, não começa outra tentativa. O WASM bloqueia acesso
ao host; o sandbox nativo é uma segunda camada a comprovar, não uma alegação feita
pela simples presença de um processo filho.

Antes de candidatos reais, provas sintéticas devem negar import de node:fs,
escrita/leitura do arquivo-sentinela protegido, acesso a process/env e fetch,
loops, explosão de memória, recursão e resposta incompleta. No auxiliar, executar
também um probe confiável de escrita e rede local sob a mesma política para
verificar que o controle do Windows foi aplicado. Não sondar rede externa.

## 5. Protocolo e resposta do modelo

`RpcClient` oferece request(method, params, signal), notify, onNotification e close.
Parser recebe chunks, não presume que um chunk seja uma linha; limite 1 MiB por
mensagem, IDs únicos, timeout, rejeição de EOF e IDs duplicados. Mensagens chegam
como unknown e são validadas antes do uso. Esquema local tem precedência sobre
exemplos web. Não usar deprecações nem habilitar experimentalApi por padrão.

App Server principal usa stdio e estado próprio Relay; o provedor recebe OAuth
apenas no ambiente desse filho, conforme o fluxo oficial. Desabilitar ferramentas
de shell, aplicativos, plugins, memória e subagentes na configuração desse filho;
verificar suporte com strict-config. Não ampliar permissão se houver incompatibilidade.
O único produto esperado do modelo é JSON com código ou pedido de esclarecimento.
O Relay aplica a fonte em discount.mjs após validar caminho real, tamanho e hash.
Nenhuma ferramenta do modelo precisa ler arquivos, executar comandos ou escrever.
Qualquer solicitação de ferramenta/permissão é negada e invalida a tentativa.

Schema de saída a enviar por `outputSchema`:

```json
{
  "type": "object",
  "properties": {
    "kind": { "type": "string", "enum": ["candidate", "needsInput"] },
    "source": { "type": "string" },
    "reason": { "type": "string" }
  },
  "required": ["kind", "source", "reason"],
  "additionalProperties": false
}
```

Para candidate, source não vazia e reason vazia; para needsInput, source vazia e
reason não vazia. A validação local aplica isso mesmo que o serviço aceite outro
formato. Abrir thread nova por tentativa, mantendo só contrato, pedido, fonte
atual e diagnóstico. Input inicial <= 32 KiB, escalada <= 96 KiB, prompt <= 8 KiB;
não enviar logs brutos. Só `turn/completed` terminal autoriza o verificador.

## 6. Casos obrigatórios do controlador e das métricas

Testes abaixo são offline, com adaptador falso de sequência declarada:

| Histórico / evento | Esperado |
| --- | --- |
| histórico vazio, remainingMs > 0 | run economico |
| primeiro resultado passed | complete; só uma chamada |
| economico implementation, remainingMs > 0 | run robusto |
| robusto implementation após economico | stop implementation; duas chamadas |
| reference vazio | run robusto; apenas uma chamada |
| reference robusto implementation | stop implementation; nenhuma escalada |
| environment/access/scope/integrity/inconclusive em qualquer tentativa | stop na mesma categoria; nenhuma escalada |
| remainingMs <= 0 | stop limit; nenhuma nova chamada |
| AbortSignal abortado | stop cancelled; confirmar encerramento do filho |
| JSON de candidato inválido | stop inconclusive |
| needsInput válido | stop scope; apresentar motivo |
| callback com state/nonce/assinatura/audience/issuer inválido | login recusado; nenhum token salvo |
| token sem chatgpt.tokens.use.direct | access; nenhuma inferência |
| snapshots total=10, depois total=14 no mesmo turno | total final=14, não 24 |
| segundo turno total=6 | agregado dos turnos=20 |
| segundo turno total ausente | agregado total=null |
| cachedInput presente | não adicionar de novo a input |
| OAuth acessível ao processo principal | não aparecer em runner, relatório ou stderr persistido |
| duas identidades com mesmo clientId | IDs distintos; escolha/read/lock/refresh preservam ambos |
| relatório de duas tentativas | versões, durações, casos e referências de diff persistem sem tokens |

Exemplo do primeiro teste de política, inicialmente vermelho:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../src/policy.js';
test('começa no perfil econômico', () => {
  assert.deepEqual(decide([], 600_000), { action: 'run', profile: 'economico' });
});
```

O restante da matriz é obrigatório, com resultados literais acima; não substituir
testes de comportamento por mocks que apenas repitam chamadas da implementação.
Em npm test, verify.test injeta SandboxPort com resultados/erros literais e
controller.test injeta Verifier e relógio. Isso testa comparação, protocolo de
resultados e decisões sem executar QuickJS, Codex real ou candidatos. Baseline,
referência e adversos pelo runner completo pertencem a test:native, gate separado
obrigatório antes de síntese real; não declarar que mocks comprovam isolamento.
