# JARVIS repository foundation

Status: approved and delivered on 2026-10-23. This is a bounded repository setup,
not an application architecture or a choice of product stack.

## Observations and agreed scope

On 2026-10-23 the repository contained only Git metadata, with no commits,
remote, application, instructions, dependencies, lockfiles, checks, or CI.
The user chose: prepare the repository for a future project; leave the stack
undecided. Product, audience, features, runtime, database, UI, and hosting remain
explicit future decisions.

Source: Vibe Coding Toolkit revision
`790a895304e0c08b70a5b215c9d334f1c86b816c`, prompt 12 and its catalog/templates.

## Approaches considered

1. Documentation only: smallest footprint, but no repeatable verification.
2. Documentation plus a dependency-free local check and reusable native harness
   procedures: recommended. Verifies this repository without choosing an app stack.
3. Scaffold an application and install its ecosystem: premature while the product
   and stack are undecided; excluded by the user's decision.

## Approved design and acceptance

Create the nine toolkit manifest documents, with a short AGENTS.md index and
CLAUDE.md import. Describe only actual capabilities. Add Git/editor hygiene,
a PowerShell repository check with a self-check for its nontrivial logic, and
versioned procedures for review, measured harness improvement, recovery, and
tool selection. PowerShell is a maintenance tool, not the selected app runtime.

Use native process/style agreements as explicitly labeled equivalents for
Superpowers, Ponytail full, and Caveman. Do not claim those plugins are installed.
Configure one credential-free project Context7 MCP connection only after checking
for duplicates; test discovery/query if this host permits it. Record trust,
authentication, restart, and network limits separately. Use official docs as
the current fallback. No global installations are included.

All nine documents must have useful project-specific content, valid local links,
and no template fields. The local check and its negative self-check must pass.
Every catalog component must receive a disposition. Inspect the entire proposed
file layer independently and run relevant disposable harness smoke cases.
Record actual results, unrun checks, and next actions in docs/setup.md.

## Approval-time coverage matrix

This table preserves the approved proposal. Final statuses and evidence, including
the subsequently successful native Context7 calls, are in [setup](../setup.md).

All actions are project-scoped unless stated otherwise. Baseline means the empty
checkout or capabilities observed in this session; risk concerns this setup.

| Component | Need / current state | Proposed action | Dependency / risk | Validation |
| --- | --- | --- | --- | --- |
| 01 Superpowers | Process needed; skill absent | Native proportional design/debug/verify equivalent | Approved scope; low | Written criteria and observed execution; no plugin claim |
| 02 Subagents | Independent assessment/review useful; host supports it | Reuse host tools with one writer and read-only reviewers | Authorized provider; low | Review actual working layer; inspect returned evidence |
| 03 RTK | CLI absent; native hook unobserved | Block binary/hook integration pending separately authorized machine setup; retain ordinary output | Global prerequisite; medium | Future binary/version, one rewrite, original output; not claim active |
| 04 Ponytail | Small complete setup needed; plugin absent | Native full-intensity scope/reuse equivalent | Existing instructions; low | No unused app dependencies/abstractions |
| 05 Caveman | Concise communication needed; plugin absent | Native clear concise style equivalent | User language; low | Normal documentation; exact restrictions retained |
| 06 ESLint/Biome and typed rules | No JS/TS application | Inapplicable now; native PowerShell documentation check instead | Revisit when stack selected; low | Check plus negative self-check; no invented lint/type/build |
| 07 Graphify | No source relationships; CLI absent | Inapplicable for this documentation foundation; record future trigger | Codebase/CLI later; low | Honest zero graph coverage, no extraction claim |
| 08 Obsidian | No external memory need/destination | Inapplicable; versioned docs suffice | Revisit concrete cross-project need; low | No vault/server/export |
| 09 Client memory | Continuity needed; no project index | AGENTS.md links to canonical detailed docs with evidence/date/invalidation | Host instruction discovery; low | Clean-context retrieval smoke; distinguish client restart |
| 10 Hooks | No proven gap | Inapplicable; no custom or Git hooks | Future demonstrated need; low | No hook installation or permission changes |
| 11 agent-browser | No UI/server; CLI absent | Inapplicable now | UI later; low | No browser flow fabricated |
| 12 Context7 | Current docs useful; loaded tool absent; CLI list empty | One project MCP config; official-doc fallback | Project trust/restart/service access; medium | Config parse, discovery and real query separately |
| 13 Artifact/skill creation | Bundled artifact and skill tools already loaded | Reuse existing on demand; no new template/skill without recurring need | Relevant future artifact; low | Session inventory only, no artifact workflow claim |
| 14 Chrome DevTools MCP | No interface to diagnose | Inapplicable; host browser available on demand | UI/network/performance need later; low | No extra server or personal session access |
| 15 Codex workflow | Active desktop and CLI | Short AGENTS.md; optional Claude import; project-only config | Existing client/auth/model preserved; low | CLI help/config checks; new session remains separate |
| 16 Vercel React/composition/design/transitions | No React/Next/UI | Inapplicable | Chosen compatible stack later; low | No ecosystem dependencies installed |
| 16 writing-guidelines | Documentation present; native writing/review sufficient | Reuse equivalent native editorial review | Actual docs; low | Readability/link review |
| 16 optimize/deploy/CLI tokens | No Vercel project or hosting choice | Inapplicable | Explicit hosting/task/access later; low | No publishing/token configuration |
| 16 React Native/Expo | No mobile platform | Inapplicable | Chosen mobile stack later; low | No mobile skill/dependency |
| 16 find-skills | Host already has skill/plugin discovery | Reuse equivalent existing discovery plus catalog routing | Concrete missing capability; low | Record loaded tools vs disk presence |
| 17 next-dev-loop/bundle optimizer | No Next.js, analyzer or server | Inapplicable | Compatible application later; low | No framework/bundler changes |
| 18 PostgreSQL skill | No database/ORM | Inapplicable | PostgreSQL chosen later; low | No provider, schema or migrations |
| 19 gh-fix-ci | No remote/Actions/PR; gh absent | Inapplicable | Authorized GitHub repo/checks later; low | No account lookup, CI run or push |
| 20 Security/differential review | Tooling review relevant; no history range | Native read-only file-layer review and versioned prompt 13 invocation | Explicit untracked layer; low | Check executable/config trust boundaries; private findings |
| 21 shadcn | No UI system | Inapplicable | Explicit UI choice later; low | No adoption by installation |
| 22 Sentry MCP | No chosen service/org/project | Inapplicable | Authorized service/project later; low | No SDK/account/OAuth connection |
| 23 Harness2 native adaptation | Default required; no workflow yet | Document procedure, run disposable smoke, one candidate only for observed failure | Native tools only; medium | Independent evaluator and observed actions; no framework claim |
| 23 Official Harness2 CLI lab | Not selected; no demonstrated need | Inapplicable to project scope | Separate lab/dependency/cost decision; medium | No benchmark install or paid run |
| Extras: aia-harness/official Claude plugins | No missing capability requiring another client | Inapplicable; native onboarding/review equivalents | Concrete future need; low | No duplicate harness/client integration |
| Nine-document map and handoffs | No existing canonical documents | Create nine destinations; keep temporary handoff in this plan if needed | Approved design; low | Complete content, links, check and recovery instructions |

## Bounded delivery sequence

1. Foundation: create the nine documents and hygiene files; preserve all Git state.
2. Tools: configure only the project Context7 connection if permitted; record
   equivalents, unavailable prerequisites, and all inapplicable catalog items.
3. Quality: add the small local check and meaningful negative self-check; document
   canonical commands and reusable security/Harness2 source invocations.
4. Verification: run checks, safe rerun/customization checks, disposable harness
   smoke cases, and one independent read-only review; resolve verified findings.
5. Delivery: update setup evidence and this plan's status, with pending external
   interventions and the next product-definition task.

No commits, pushes, publishing, messages, scheduled automation, service accounts,
global installs, branch/worktree requirements, hooks, permission weakening,
application scaffold, or stack selection are part of this proposal.

Recovery: before implementation there is no existing configuration to back up.
New files can be reviewed individually and removed by their explicit path if
rejected; preserve user edits and never use a broad clean/reset. Any configuration
that appears before an edit must be rechecked and backed up outside Git first.

## Delivery record

All five bounded deliveries completed. Nine canonical docs, hygiene, attribution,
two maintenance scripts, and one project Context7 definition were added without
an app scaffold or global changes. Repository check passed; checker self-test
passed 13/13. Disposable boundary and stale-handoff fixes passed 7/7 each; the
read-only review fixture stayed unchanged. Independent review inspected all 17
new files and reported no actionable findings. Clean-context retrieval passed.

Current-chat native Context7 resolve/query succeeded after tools became available.
Separate CLI/restarted-client/Claude loading remains unverified. RTK installation
is a separately authorized machine prerequisite; other deferred components have
explicit applicability triggers. No observed harness failure justified a candidate
trial. See setup for evidence, limits and maintenance; define the first product
flow in PRODUCT.md before choosing an application stack.
