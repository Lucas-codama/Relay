# Local preparation and recovery

## Falhas de uso

Limite de uso atingido: abra https://chatgpt.com/settings/usage e confira o limite global e App limits do Relay. Limites são controles do usuário; não são elevados automaticamente. HTTP429 pode ser excesso de solicitações, sem provar cota esgotada. Sessão não autorizada: use relay.cmd login e reabra o chat. Relatórios antigos que só guardaram access não permitem reconstruir o motivo exato.


## Comandos durante a tarefa

/status mostra etapa/modelo/tempo; /usage mostra consumo; /details abre diagnóstico;
/cancel interrompe a tarefa e mantém a conversa. /exit cancela a tarefa atual e
limpa a fila; EOF conclui os pedidos já aceitos. Prompts são executados um de cada
vez e a fila aceita oito pendentes. /undo só funciona sem tarefa ativa.
O painel pausa enquanto você digita. Não é necessário esperar a resposta para
usar comandos locais. Consumo da conversa e histórico de até20 tarefas são locais
à sessão; os relatórios completos permanecem no estado privado do Relay.
run/bench aceitam --details na primeira execução para saída completa; uma falha
mostra o arquivo local de diagnóstico, evitando uma nova chamada só para investigar.


Painel de uso: após recompilar, conclua a tarefa atual, use /exit e abra o Relay novamente pelo mesmo comando. Etapa/tempo são locais; tokens só mudam quando o Codex envia dados, às vezes apenas no encerramento. Cota da assinatura pode ficar indisponível nesta autenticação; isso não significa saldo zero. Se houver várias contas, mantenha --account ID explícito, obtido por relay.cmd accounts; o painel não troca de identidade.


## Agente de projetos atual — 2026-10-24

Se o terminal comum não reconhecer pwsh, execute .\relay.cmd chat --project DIR
na pasta do Relay; fora dela, use & seguido do caminho completo entre aspas.
relay.cmd/scripts/launch-relay.mjs reutilizam Node em Program Files e localizam
PowerShell 7 no runtime do app ou Program Files e o Codex validado no cache
OpenAI/Codex/bin. Não alteram PATH persistente ou políticas de execução.
Para diagnóstico sem inferência, use .\relay.cmd doctor. O runtime instalado
e sua versão ainda são exigidos; não há instalação automática.

Após build/login/configure, use node dist/src/cli.js chat --project DIR ou
node dist/src/cli.js run "pedido" --project DIR. DIR pode ser novo. O padrão
é conversa no diretório atual. /help lista comandos e /undo restaura o último
lote sem sobrepor alterações externas. Bench compara cópias e preserva o original.
run/chat/bench aceitam --max-turns 1..5; o limite 1..2 abaixo vale só para demo.
O agente escreve no projeto com backup, diferentemente do demo histórico.
Use Node JavaScript sem dependências com node:test para verificação funcional.
Relatórios e backups por projeto ficam em %LOCALAPPDATA%/Relay/projects.
Sem MXC validado não há alternativa que reduza isolamento. Falhas preservam
arquivos para inspeção; não remova estado manualmente durante tarefas.


## Prerequisites and first check

For maintenance, use Git and PowerShell 7+ (`pwsh`); no secret is required.
For the prototype, also use Node 24.18.0 from the 24 line, npm and the verified
Codex CLI 0.164.0-alpha.11.1 on Windows with native MXC available. Reuse installed
tools; the prototype does not provision machine prerequisites automatically.

From the repository root:

```powershell
git status --short --branch
pwsh --version
pwsh -NoProfile -File scripts/check.ps1
pwsh -NoProfile -File scripts/check-self-test.ps1
```

Success produces a repository PASS summary and passing positive/negative
self-check cases. See [quality](quality.md) for their exact scope.

## Prototype installation and demonstration

```powershell
npm ci --ignore-scripts
npm run check
npm run test:native
npm run doctor
node dist/src/cli.js login
node dist/src/cli.js models
node dist/src/cli.js configure
node dist/src/cli.js demo "Corrija o cálculo de desconto e preserve os casos válidos."
```

check/test:native compile the sources; otherwise use npm run build before invoking
dist/src/cli.js. The CLI bin is relay when invoked by a package runner; no global
installation/link is required. configure needs an interactive terminal and saves
two distinct catalog-supported combinations. Catalog presence does not prove model
access or relative cost. demo uses up to two synthesis turns in the selected plan;
optional --compare adds one robust reference. No comparison runs implicitly.
Use --max-turns 1 to reduce the adaptive budget; values above two are refused.

Login opens OpenAI's official system-browser flow. Finish consent there; do not
paste tokens into the terminal or copy another client's auth.json. State lives
in %LOCALAPPDATA%/Relay; MSIX may map that logical path to a package LocalCache.
Credentials have explicit user/SYSTEM ACLs, atomic replacement and a lock released
by the OS after process death. accounts lists opaque IDs/local labels; select
--account ID when more than one registration exists. Profiles and sanitized
reports are local to this state. Failure copies/diffs stay in owned relay-demo
temporary directories for inspection; nothing is applied to the user's project.

Exit codes: 0 verified, 1 functional/inconclusive/integrity, 2 input/scope,
3 environment, 4 access/quota/login, 5 time budget, 130 cancellation. Ctrl+C stops
owned processes; missing termination confirmation prevents another attempt.
In an agent host sandbox, synthetic tests may need authorized loopback and
Windows ACL/junction handling. Do not disable the application's MXC boundary.

## Agent preparation

Read [AGENTS.md](../AGENTS.md); [CLAUDE.md](../CLAUDE.md) imports the same index
for Claude Code. Current integration evidence is in [setup](setup.md).

Context7 is defined once in `.codex/config.toml`. Inspect and trust this project
through the client's supported workflow, then open a new chat if needed. Confirm
tool discovery; resolve a public library ID and query one concept before treating
the connection as functional. If the service requests authentication, complete
its official client OAuth/key flow outside the repository. Do not add a duplicate
global server or put credentials in this file. Until then, use official docs and
record the limitation. CLI registration is weaker evidence than a live query.

## Diagnosis and recovery

Missing `pwsh` means the local maintenance prerequisite is unavailable; install it
through a separately authorized machine task. Do not change execution policies or
use bypass flags to force a script through an organizational restriction.

If doctor reports a different Codex version, inspect that CLI's generated schema
and adapt compatibility checks before changing the verified version. If MXC or
managed-policy compatibility is unavailable, preserve the diagnostic and finish
offline work; no silent elevated/unelevated/external fallback exists. An unsafe
existing state ACL is refused rather than repaired automatically. After a failed
code exchange, a client without validated identity is not persisted; retry only
with a new explicit user sign-in, without claiming registration succeeded.

A checker failure lists the affected path and reason. Correct the responsible
document or script, preserving useful user content, then rerun the relevant
check. The checker does not validate remote URLs or Markdown anchor IDs and is
not a secret scanner; inspect those during relevant review.

Before changing existing configuration, preserve a recoverable copy outside Git;
do not back up secrets into this repository. The initial setup found no existing
configuration, so no pre-setup content needed backup. Review new files individually
when undoing setup. Preserve later edits and remove only explicit owned paths;
do not use broad cleanup/reset commands. Nothing here modifies a service or DB.

On resumption, inspect the actual checkout, local changes, running processes, and
the relevant plan before trusting a handoff. Stop only resources created for the
task. Keep private logs/reports outside Git and redact secrets before sharing.
