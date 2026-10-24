# Quality and harness procedures

## Regressões de acesso e contexto

Testes distinguem quota/rate/401/403/5xx, rejeitam códigos JSON-RPC como HTTP e garantem ausência de canários secretos no diagnóstico. Eventos de erro são correlacionados; erro terminal sem detalhes pode usar notificação permanente correspondente. Renovação usa a mesma conta e não reutiliza token expirado após falha. A triagem local respeita HTTP explícito e não interpreta alteração cosmética como resposta a pergunta anterior. Revisão independente identificou e corrigiu a precedência de arquivo sobre HTTP.


## Gate da experiência direta

Cobertura inclui comandos antes do término de run, FIFO, fila cheia, limpeza antes
da tarefa seguinte, /exit descartando fila, EOF esvaziando fila, /undo sem concorrência,
linha parcial TTY preservada durante atualização/fim, tokens observados em falhas,
reuso sem dupla contagem e síntese bloqueada após encerramento não confirmado.
Apresentação testa 9 aprovados/3 falhos sem dump, detalhes opt-in, estados sem falsa
aprovação, arquivos únicos por criação/alteração e dicas corretas para chat versus
execução única. Os testes não usam inferência ou credenciais reais.
Revisão independente cobriu coordenação, renderização e métricas. A dica de comandos
chat em run/bench foi corrigida com regressão. Limites de sandbox e autenticação
permanecem os mesmos; native cobre contagens reais passed/failed e Node filho.


Regressões do painel cobrem snapshots duplicados e entre tentativas, thread errada, cota multi-bucket/ausente/zero, leitura antiga após notificação, observador com erro, relógio, limpeza de timer e saída TTY/NO_COLOR/pipe. Testes usam eventos sintéticos; não inferem consumo nem saldo. A ampliação não altera o executor nativo ou permissões.


## Cobertura do agente de projetos — 2026-10-24

npm run check inclui caminhos/links/segredos, gitignore, edições/undo retomável,
contexto, classificação sem IA, reparo restrito, cache sem chamada, proteção de
testes com diferenças de caixa, cancelamento antes de escrever e terminal.
test:native também cobre o perfil MXC restrito com projeto Node de vários arquivos.
Revisão independente confirmou correções de cancelamento, testes protegidos,
backup preservado após conversa/cache, undo e confiança por conteúdo/conjunto.

Bench contabiliza todas as tentativas. Só compara resultados aprovados no mesmo
conjunto inicial protegido, contagem igual e métricas reais. Testes gerados pelo
agente não demonstram economia com qualidade equivalente. Uma amostra não prova
economia geral ou conversão para cota/dinheiro. O suporte funcional atual é Node
JavaScript sem dependências. O histórico abaixo descreve o primeiro demo.


## Canonical checks

| Command | What it proves |
| --- | --- |
| `npm run typecheck` | Strict TypeScript contracts; no application execution |
| `npm test` | Builds and runs synthetic/fake Node tests, including local OAuth/JWKS, Windows state protection, routing, RPC, reports and process recovery; no inference/public HTTP |
| `npm run test:native` | Explicit MXC readOnly/network probe, no credential inheritance, baseline/ref/adverse WASM cases and cancellation recovery; no model |
| `npm run check` | typecheck, npm test and repository check; no publish/deploy |
| `npm run build` | Emits the CLI, runner and tests into ignored dist/ |
| `npm run doctor` | Local executable/version/handshake/native probe; no login or inference |
| `npm audit --json`, `npm audit --omit=dev --json` | Current registry advisories for all versus production dependencies; read-only network check |
| `pwsh -NoProfile -File scripts/check.ps1` | Nine nonempty canonical documents; obvious template markers absent; inline local Markdown file targets exist inside the repository; no trailing whitespace in selected documents/scripts; maintenance PowerShell parses; one expected credential-free Context7 definition |
| `pwsh -NoProfile -File scripts/check-self-test.ps1` | Synthetic valid foundation accepted; missing file, template marker, broken/escaping link, trailing whitespace, invalid script syntax and duplicate/changed MCP definition rejected; repeated check preserves custom content |
| `git diff --check` | Whitespace errors in tracked changed layers only; the repository checker also covers currently untracked selected files |

The maintenance commands are credential-free; application tests use synthetic
secrets and owned loopback listeners. Windows ACL/junction negatives and process
termination require normal local permissions; the agent host's outer sandbox may
prevent those tests, independently of the application's sandbox. Public HTTP is
used only by an explicit audit/login/catalog/live command, never npm test.
No separate ESLint/Biome, typed async lint or logger framework is installed for
this bounded prototype; strict compilation, tests and independent review are its
current gate. Modules remain below the 350-line reference. Database, CI and visual
browser checks are inapplicable. The checkers are not full Markdown parsers,
TOML parsers, security scanners, link crawlers, or application tests. They check
inline local file targets, not remote availability or anchor IDs.

Run the relevant commands after code changes; repeat native tests when interpreter,
sandbox, environment or process lifecycle changes. The maintenance self-test is
needed when maintenance scripts change; prose-only updates reuse unchanged evidence.
Test behavior and failures, including regression evidence for confirmed bugs.
Do not weaken validation or add broad suppressions to clear a check.

## Review and reusable security review

For nontrivial changes, identify exact committed endpoints and the staged,
unstaged, and untracked layers. With no commits, review all new files explicitly;
an empty `git diff` does not cover them. Inspect affected callers, contracts,
configuration and tests. Choose review scope from actual risk; use independent
read-only review when available. Findings need severity, path, concrete scenario,
and evidence. Verify findings, apply authorized corrections, rerun affected checks,
and stop when findings are resolved or dispositioned. Further rounds require new
evidence or unresolved risk; do not restart a user-agreed review count.

Reusable security invocation (manual tracing is the current equivalent of the
optional differential-review skill):

> Read only the Prompt block of the versioned security review source below and
> execute it for this repository baseline or the explicitly supplied diff. First
> state the exact revision/working layers and exclusions. Keep the review read-only
> and the redacted report outside this repository at an explicitly chosen private
> destination. Trace reachable inputs into sensitive operations and distinguish
> confirmed vulnerabilities from hypotheses. No production probing, code upload,
> credentials, publishing, or fixes are authorized by a review alone.

[Security review prompt 13](https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/790a895304e0c08b70a5b215c9d334f1c86b816c/docs/prompts/13-security-review.md).
For this prototype review OAuth/OIDC callbacks/refresh/identity, ACLs and OS locks,
JSONL boundaries, model event correlation, budgets and the WASM/native runner.
Do not invent application routes beyond the loopback login callback. Keep sensitive
findings private; record only sanitized coverage/outcomes in setup.md.

## Harness evaluation and measured improvement

Mode: **Harness2-inspired native method adaptation**. This procedure uses the
current native agent and existing checks. It does not install/run the Harness2
framework or reproduce its algorithm or benchmark results. Preserve the current
main model, provider, authentication, permissions, and customizations.

Versioned sources from the single toolkit revision above:

- [Evaluation guide](https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/790a895304e0c08b70a5b215c9d334f1c86b816c/docs/07-harness-evaluation.md)
- [Prompt 14: harness evaluation](https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/790a895304e0c08b70a5b215c9d334f1c86b816c/docs/prompts/14-harness-evaluation.md)
- [Prompt 15: bounded improvement](https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/790a895304e0c08b70a5b215c9d334f1c86b816c/docs/prompts/15-harness-improvement.md)
- [Harness2 integration guide](https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/790a895304e0c08b70a5b215c9d334f1c86b816c/docs/tools/23-harness2.md)

Reusable invocation:

> Execute the Prompt block of the pinned prompt 15 using native method adaptation.
> Read the actual project and prior evidence first. Use relevant disposable prompt
> 14 cases and existing checks. Keep original inputs/evaluator outside worker
> writable files. If there is no observed harness failure, record smoke evidence
> and retain the working harness. Otherwise compare one minimal candidate against
> the same task/inputs/checks with comparable client/model settings; adopt only an
> independently supported improvement. Do not change acceptance, permissions,
> model provider, authentication, or install dependencies to obtain a pass.

For initial smoke evaluation, use separate disposable fixture copies for boundary
fix, stale handoff, and read-only review. Inspect evaluator/source before execution.
The deliberately insecure baseline must fail cross-tenant and invalid-identity
checks. Rerun the unchanged evaluator after fixes; verify unrelated notes and
instructions by hash. For review, confirm the fixture is unchanged and manually
validate the report. Never copy the insecure fixture into application code.

Record input/evaluator hashes, client/version, actual observable model/effort,
commands/results, changed files, observed actions, elapsed time and limits in
[setup](setup.md). A fresh subagent is not a restarted client. Unobservable cases
(trust, loading, pause/resume, resource conflict) stay not run. One pass is smoke
evidence, not a reliability rate. Keep temporary raw traces outside the project.

Limit an improvement trial to one candidate unless a new explicit budget is agreed.
Keep durable lessons in the responsible document with evidence/date/invalidation.
On unchanged setup reruns, reuse relevant evidence and preserve customizations;
recheck after material changes. Do not automatically restart trials or paid runs.
The optional official CLI lab and model benchmarks require a separate scope,
environment, dependency, permission, authentication and cost decision.

## Maintenance and provenance

The adopted source revision is pinned in [setup](setup.md). When updating the
toolkit, obtain one new revision outside the project, review the relevant guides
and upstream changes, reconcile customizations, then update references and rerun
affected checks. Do not copy the toolkit wholesale or mix revisions. Keep checks
explicit; no Git hooks, branch requirements, or push blockers are installed.

Regressão de calculadora: teste Node filho sem flags explícitos deve executar sob MXC; os probes continuam comprovando negação de sentinela, escrita e rede. Classificação mantém EPERM/lstat/toRealPath como ambiente e falhas funcionais como implementação. Caso real do usuário passou nos 12 testes em cópia isolada após a correção, sem inferência ou alteração do projeto original.
