# Relay

## Start here

Read [PRODUCT.md](PRODUCT.md) and relevant files before editing. This repository
has a verified foundation and a product direction under planning: a terminal
coding agent using an existing Codex subscription with adaptive model selection.
The prototype design is approved: TypeScript/Node 24 and a local Codex App Server
adapter. The user subsequently authorized the integrated project agent: chat/run,
local routing, bounded context, protected checks, scoped repair, undo and bench.
Read docs/setup.md for actual live evidence and remaining limitations.
Do not infer additional framework, database, or hosting choices from its name.

## Canonical commands

Run from the repository root with PowerShell 7+:

- Repository check: `pwsh -NoProfile -File scripts/check.ps1`
- Check self-test: `pwsh -NoProfile -File scripts/check-self-test.ps1`
- Install: `npm ci --ignore-scripts` (project dependencies only)
- Application check: `npm run check` (types, offline tests, repository check)
- Native sandbox gate: `npm run test:native` (synthetic, no model)
- Build/diagnose: `npm run build`, `npm run doctor`
- CLI: `node dist/src/cli.js --help`
- Conversation: `node dist/src/cli.js chat --project DIR`
- Task: `node dist/src/cli.js run "pedido" --project DIR`
- Comparison: `node dist/src/cli.js bench "pedido" --project DIR`

Tests need owned loopback connections and synthetic Windows ACL/junction handling;
the host agent sandbox may block these even though normal local execution works.
No development server or standalone lint command exists. Live demo uses subscription
quota and needs applicable authorization. Check Git state and preserve local edits.

## Working agreements

- Define acceptance and relevant checks before implementation; distinguish facts,
  assumptions, decisions, and evidence. Scale design and plans to the change.
- Complete authorized work with the smallest sufficient change. Reuse native
  features and existing tools; preserve validation, errors, security, accessibility,
  contracts, and user customizations. Reproduce bugs and test regressions when feasible.
- These are native equivalents of Superpowers process, Ponytail full scope, and
  Caveman style. Those plugins are not installed. Be concise in the user's language;
  use normal, clear wording in code, documents, and commits.
- Consult version-matched official documentation. Use Context7 only when it is
  actually available: resolve the library, then query one concept. Never send
  secrets, private code, or personal data. Record unavailable integrations honestly.
- Status questions do not cancel authorized work. Complete independent work when
  a dependency is blocked; honor explicit pauses and limits. Do not repeat identical
  failed attempts without new evidence or claim unverified background execution.
- Before resuming, verify actual files, checkout, checks, and owned resources.
  Keep temporary handoffs with the relevant plan: objective, state, evidence,
  blockers, owned resources, and next action.
- Do not publish, push, send external messages, create costs or automations, alter
  permissions, or perform destructive actions without applicable user authorization.
  Setup adds no Git hooks, branch/worktree requirements, or push blockers.

## Tools, delegation, and review

Use [setup](docs/setup.md) for installed/configured/blocked capability status.
Load relevant host skills on demand; do not copy personal caches or duplicate
plugins. Tool installation does not authorize its external actions.

Delegate when the user or an applicable workflow authorizes it and isolation or
independent review is useful. Give each worker a goal, minimal context, allowed
files, resources, checks, and limits. One writer per file; the coordinator owns
shared configuration and integration. Reviewers are read-only. Confirm a worker
has stopped before taking over. Preserve the main model, provider, authentication,
and permissions; use supported model selection only under an authorized policy.

Run relevant checks and inspect the complete changed layer. For nontrivial work,
use independent review when available. Resolve or explicitly disposition findings;
additional rounds need new evidence or unresolved risk. See
[quality](docs/quality.md) for review, security, and measured harness procedures.

## Context map

- [PRODUCT.md](PRODUCT.md): scope, constraints, acceptance, and next product task.
- [Architecture](docs/architecture.md): actual files, boundaries, decisions.
- [Design](docs/design.md): UI applicability and future accessibility criteria.
- [Onboarding](docs/onboarding.md): prerequisites, diagnosis, recovery.
- [Quality](docs/quality.md): checks, review, harness evaluation and improvement.
- [Setup](docs/setup.md): versions, provenance, coverage, evidence, memory, blockers.

Update the responsible document with behavioral, command, boundary, or config
changes. Keep durable facts there with source, last verification, and invalidation
trigger; keep this index short and retire superseded facts.
