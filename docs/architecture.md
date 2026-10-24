# Repository architecture

## Diagnóstico seguro do provedor

provider-errors reduz erros estruturados a código permitido, status HTTP válido e mensagem fixa. Nenhum texto bruto, URL ou corpo do provedor é persistido. codex acompanha error e turn/completed correlacionados; rpc preserva diagnóstico estruturado. engine/report/UI mantêm providerFailure opcional. synthesis-session verifica expiresAt em milissegundos e renova a mesma registrationId quando restam60 segundos. Não troca conta, provedor, cobrança ou perfis. /usage aponta o gerenciamento oficial; o saldo do host não é apresentado como limite específico do Relay.


## Conversa e apresentação atuais

chat.ts usa eventos line, com tarefas seriais e fila limitada a oito prompts de
até 8 KiB. Comandos locais são tratados imediatamente, sem entrar na fila de IA.
/cancel aguarda o run terminar antes de iniciar outro; /exit limpa a fila e cancela;
EOF deixa terminar a fila aceita. /undo não concorre com tarefas. Falha em confirmar
o encerramento da síntese bloqueia novas tarefas na instância da engine.

Em TTY, keypress pausa o painel durante edição; getCursorPos/prompt(true) preservam
o buffer ao imprimir um resultado. APIs públicas conferidas via Context7 na
[documentação Node 24](https://nodejs.org/docs/latest-v24.x/api/readline.html).

terminal-ui apresenta resumo compacto; details/usage concentram diagnóstico e
métricas. live-status oferece pause/resume/status/details e histórico sanitizado
limitado a 50 eventos/16 KiB. Relógio congela no fim; a animação é local. chat soma
relatórios encerrados e o último snapshot da tarefa ativa, sem duplicar eventos;
retém 20 relatórios em memória. Totais desconhecidos continuam desconhecidos.
CheckResult inclui contagens opcionais passed/failed extraídas do TAP; tentativas
registram created/modified; nextCommand sugere npm start somente quando há script.
Resposta textual posterior a teste falho não transforma o resultado em aprovação.
Campos novos são opcionais para preservar relatórios antigos. A saída de run/bench
adapta dicas à execução única e oferece --details, sem comandos exclusivos do chat.


live-status.ts apresenta status passivamente, com timer local de 250 ms em TTY; quota.ts valida e reduz a resposta a janelas/percentuais/renovação sem dados de autenticação. SynthesisPort aceita observador opcional. codex.ts correlaciona snapshots por thread/turn, lê account/rateLimits/read uma vez por turno observado e acompanha notificações; sem polling nem inferência extra. Notificações mais novas prevalecem sobre uma leitura inicial atrasada. Erros de observação/cota não impedem a síntese. project-engine substitui o snapshot da tentativa e soma tentativas, sem somar atualizações repetidas. chat/cli encerram o painel ao terminar, cancelar ou falhar.


## Agente de projetos atual — 2026-10-24

relay.cmd/relay.ps1 delegam a scripts/launch-relay.mjs. O bootstrap localiza apenas
runtimes já instalados em locais conhecidos, recusa links nos caminhos candidatos
e verifica a versão antes de acrescentar seus diretórios ao PATH do processo.
Preserva comandos existentes no PATH; versions continua validando compatibilidade.
Não edita o ambiente persistente nem instala ferramentas. O CLI compilado direto
continua disponível quando o terminal já tem os pré-requisitos no PATH.

Esta seção substitui os limites de alvo único do demo histórico abaixo.
project-engine coordena tarefas; project-types define contratos; router classifica
localmente e seleciona níveis suportados. project-model define edições e pedidos
de contexto. workspace cuida de privacidade, snapshots, seleção, concorrência,
backups e undo retomável. chat/terminal-ui implementam conversa e apresentação;
benchmark compara entradas iguais em cópias privadas.

project-sandbox executa node:test em MXC com perfil explícito: negar por padrão,
leitura mínima de runtime/helpers/projeto, escrita somente em scratch e sem rede.
project-probe verifica leitura privada, escrita e rede antes de executar candidatos.
O modelo nunca executa shell. Confiança exige conjunto completo de testes iniciais
com conteúdo idêntico. Relatórios omitem código/prompt; backups contêm os originais.

Limites: snapshot 400 arquivos/1 MiB, arquivo 64 KiB, contexto 24 KiB, pedido 48 KiB,
prompt 8 KiB, cinco chamadas, dez minutos por tarefa e três por chamada. Após 80 mil
tokens observados não se inicia outra chamada; a última pode cruzar esse valor.
Reparo restringe arquivos por dependências do teste falho. Testes existentes são
protegidos sem distinção de caixa. Cache repete os testes antes de dispensar IA.
MSIX pode virtualizar caminhos: ancestrais são verificados contra links e o staging
usa caminho físico para o processo nativo. Invalidar ao alterar esses contratos.


## Actual state

The approved TypeScript/Node 24 prototype now has an npm manifest/lockfile,
build, native Node tests, a CLI and official OAuth/OIDC authentication. There is
no database, HTTP application server, remote or CI workflow. Runtime data is local
Relay state and disposable fixture copies. See [PRODUCT.md](../PRODUCT.md).

The approved [prototype design](plans/2026-10-24-prototipo-relay-design.md) uses
TypeScript/Node, local Codex App Server, configurable routing, independent
verification and bounded escalation. Its [implementation plan](plans/2026-10-24-prototipo-relay-plan.md)
proposes a pure-function QuickJS/WASM runner plus the native sandbox, with proof
required before candidate execution. The plan is approved and implemented;
runtime evidence and limitations are recorded in setup.

PowerShell 7+ supports the maintenance scripts. It is not the chosen product
runtime. Application dependencies were added after the separate plan approval.

## File map

| Location | Responsibility |
| --- | --- |
| src/cli.ts, src/doctor.ts, src/models.ts | Terminal, preflight and catalog/profile selection |
| src/auth.ts, src/store.ts, src/windows-store.ps1 | Official OAuth/OIDC; private Windows credentials and OS-held session locks |
| src/processes.ts, src/rpc.ts, src/app-server.ts, src/codex.ts | Owned process trees, JSONL, strict configuration and bounded synthesis |
| src/controller.ts, src/policy.ts, src/contracts.ts, src/errors.ts | Shared contracts, budgets, routing and failure categories |
| src/runner.ts, src/sandbox.ts, src/sandbox-probe.ts, src/verify.ts, src/cases.ts | WASM interpreter, explicit MXC, synthetic probes and host comparisons |
| src/fixture.ts, fixtures/discount/discount.mjs | One disposable source target; initial intentional defect |
| src/usage.ts, src/report.ts | Observed metrics and report allowlist |
| tests/, tests-native/ | Fake/synthetic unit integrations and separate real Windows sandbox gate |
| package.json, package-lock.json, tsconfig.json | Fixed local dependencies, scripts and compiler configuration |
| README.md | Entry point, actual verification commands, next delivery |
| PRODUCT.md | Product scope, constraints, acceptance, undecided requirements |
| AGENTS.md | Shared instruction index and concise working agreements |
| CLAUDE.md | Claude import bridge |
| docs/architecture.md | Actual structure and technical decisions |
| docs/design.md | Design applicability and future UI review criteria |
| docs/onboarding.md | Local preparation, troubleshooting, recovery |
| docs/quality.md | Checks, review, security and harness procedures |
| docs/setup.md | Source revision, inventory, coverage and verification evidence |
| docs/plans/ | Reviewable design and delivery records |
| scripts/check.ps1 | Read-only documentation and PowerShell syntax checks |
| scripts/check-self-test.ps1 | Disposable positive/negative checks of the checker |
| .codex/config.toml | One credential-free project Context7 MCP definition |
| .editorconfig / .gitattributes / .gitignore | Editor, text and local-file hygiene |
| THIRD_PARTY_NOTICES.md | Toolkit attribution; no product license is selected |

## Boundaries

The model receives bounded text and returns JSON source. It has no authorized
tool calls. Relay writes only the fixed target in an owned fixture; the verifier
never imports candidate source into Node. A separate runner executes it in
QuickJS/WASM without host bindings, under explicitly required MXC readOnly with
network access disabled. A trusted write/network probe must pass first. No native
fallback or sandbox provisioning is automatic. Managed requirements currently
block the prototype until separately validated.

Only the synthesis child receives the OAuth access token. The helper App Server
and runner use minimal authentication-free environments. Synthesis uses an empty
Relay working directory, not user project configuration. Credentials use protected
Windows ACLs and atomic replacement. Session locks are held by a helper's exclusive
file handle; EOF/process death releases the lock. A root process exit alone never
proves that its descendants stopped; uncertainty prevents the next attempt.

Persistent state is `%LOCALAPPDATA%/Relay`; MSIX may virtualize its physical path.
Link checks reject actual symlinks/junctions in ancestors rather than rejecting
legitimate MSIX canonicalization. No source, token or raw protocol error is part
of default reports. Diffs remain local artifacts in disposable copies.

The repository checker reads only the selected root documents, docs Markdown,
maintenance scripts, and the scoped Context7 configuration. It performs no
network, installation, application startup, or Git mutation. Its self-check
creates synthetic files in a unique OS temporary directory and removes only
that verified directory. Disposable agent evaluations run outside this project.

The remote Context7 service supplies library documentation. Configuration
contains an endpoint only; credentials and OAuth state belong to the client,
outside versioned files. A configured endpoint does not establish tool loading,
authentication, or a successful query.

## Decisions and reconsideration

| Decision | Reason / alternative | Revisit trigger |
| --- | --- | --- |
| TypeScript/Node 24 for prototype | User approved the bounded design after product exploration | Evidence from the first prototype or expanded scope |
| Dependency-free PowerShell maintenance | Available native tool; no app package manager exists | Actual stack provides a better canonical check |
| Short index plus canonical documents | Context can be retrieved on demand without competing sources | A recurring retrieval failure with evidence |
| Native process/style equivalents | Missing plugins do not justify machine changes for this scope | A concrete workflow gap and authorized integration |
| No application CI yet | No remote or application commands to integrate | Repository host and stack selected |

Update this map with real files and decisions when the application is introduced;
do not create empty future layers or retain obsolete capability claims.

Correção de processos Node filhos: o executor fornece NODE_OPTIONS com os dois flags fixos --preserve-symlinks e --preserve-symlinks-main, também herdados por filhos criados pelos testes. Isso evita o realpath da raiz negada pelo MXC sem ampliar permissões de leitura/escrita/rede. EPERM/lstat na inicialização toRealPath é classificado como ambiente mesmo envolto em AssertionError; o coordenador já impede escalada nessa categoria.
