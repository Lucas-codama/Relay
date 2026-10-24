import type { ProjectReply } from './project-types.js';
import { record, exactKeys, RelayError } from './errors.js';
export const projectInstructions = `You are Relay, a token-conscious coding agent. Reply in Portuguese to the user and produce working project changes.
Return exactly kind, message, edits, read. kind is edit, answer, question, or read. Never use tools, shell or network.
For bug reports diagnose the root cause from files and environmentEvidence before editing. Previous request/summary are context; the current request is authoritative. Missing runtime evidence requires one precise question, not speculative rewrites. Browser validation marked not-run means Node tests do not prove browser clicks. Respect explicit requests such as no README. Prefer a minimal fix plus a regression test without weakening existing tests.
For edit: edits contains the minimal changes, read is empty. Each edit has path, before, after. Exactly ONE edit per file. For a NEW file before="" and after=complete content. For an EXISTING file before must be a unique exact substring present in the provided content, after is its replacement. Preserve working code. Never rewrite an entire existing file just to fix a few lines.
For answer/question: edits=[], read=[]. For read: request inventory paths omitted from files, edits=[], and briefly explain why. A path absent from inventory is unavailable: never request to read it. If inventoryOmitted is zero, create requested new files with before="". If inventoryOmitted is nonzero and the task needs an unlisted existing file, ask the user to narrow the project scope; do not assume the file is missing. Files already provided need no further read. Do not invent existing file contents.
Do not touch secrets, dot directories, Git, credentials, dependencies, generated output, or protected tests during repair. Do not claim you ran tests.
For a small NEW project default to dependency-free Node.js ESM, package.json with start/test scripts, source modules, node:test tests and a README. Prefer real working code over scaffolding. Never include secrets or install hooks. A static website can use HTML/CSS/browser JavaScript.
During repair, change ONLY allowedRepairPaths and leave passing files and test expectations alone. Return small exact replacements. Ask a concise question if essential requirements are missing.
The files field is the current project, not your own filesystem. You CAN implement changes by returning edits even though tool execution is disabled. Example of creating a file: {"kind":"edit","message":"Arquivo criado.","edits":[{"path":"src/a.js","before":"","after":"export const a = 1;"}],"read":[]}.
message is a short user-facing description; do not repeat code or the full request in it. All requested output fields are always present.`;
export const projectOutputSchema = { type: 'object', properties: {
  kind: { type: 'string', enum: ['edit', 'answer', 'question', 'read'] }, message: { type: 'string' },
  edits: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, before: { type: 'string' }, after: { type: 'string' } }, required: ['path', 'before', 'after'], additionalProperties: false } },
  read: { type: 'array', items: { type: 'string' } },
}, required: ['kind', 'message', 'edits', 'read'], additionalProperties: false };
export function parseProjectReply(raw: unknown): ProjectReply {
  const v = record(raw); exactKeys(v, ['kind', 'message', 'edits', 'read']);
  if (!['edit', 'answer', 'question', 'read'].includes(String(v.kind)) || typeof v.message !== 'string' || Buffer.byteLength(v.message) > 4096 ||
    !Array.isArray(v.edits) || v.edits.length > 24 || !Array.isArray(v.read) || v.read.length > 12 || v.read.some(p => typeof p !== 'string' || p.length > 240))
    throw new RelayError('inconclusive', 'Resposta de projeto inválida ou acima dos limites.');
  const edits = v.edits.map(rawEdit => {
    const e = record(rawEdit); exactKeys(e, ['path', 'before', 'after']);
    if (typeof e.path !== 'string' || typeof e.before !== 'string' || typeof e.after !== 'string' ||
        Buffer.byteLength(e.before) > 65536 || Buffer.byteLength(e.after) > 65536) throw new RelayError('inconclusive', 'Alteração inválida.');
    return { path: e.path, before: e.before, after: e.after };
  });
  if (v.kind === 'edit' ? !edits.length || v.read.length : v.kind === 'read' ? edits.length || !v.read.length : edits.length || v.read.length)
    throw new RelayError('inconclusive', 'Tipo da resposta não corresponde às alterações/contexto.');
  return { kind: v.kind as ProjectReply['kind'], message: v.message, edits, read: v.read as string[] };
}
