// This is a standalone trusted entry point. Candidate source is data for WASM only.
import { getQuickJS, type QuickJSHandle, type QuickJSContext } from 'quickjs-emscripten';
import { record } from './errors.js';
import type { Arg } from './cases.js';
const QuickJS = await getQuickJS();
function argument(ctx: QuickJSContext, arg: Arg): QuickJSHandle {
  if (arg === null) return ctx.null.dup();
  if (typeof arg === 'number') return ctx.newNumber(arg);
  if (typeof arg === 'string') return ctx.newString(arg);
  if (arg.tag === 'undefined') return ctx.undefined.dup();
  return ctx.newNumber(arg.tag === 'NaN' ? NaN : Infinity);
}
function evaluate(source: string, args: [Arg, Arg]): Record<string, unknown> {
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(16 * 1024 * 1024); runtime.setMaxStackSize(512 * 1024);
  const deadline = Date.now() + 5000; runtime.setInterruptHandler(() => Date.now() > deadline);
  runtime.setModuleLoader(() => { throw new Error('Imports denied'); });
  const ctx = runtime.newContext(); const handles: QuickJSHandle[] = [];
  try {
    const module = ctx.evalCode(source, 'discount.mjs', { type: 'module' });
    if (module.error) { module.error.dispose(); return { kind: 'invalid' }; }
    handles.push(module.value);
    const fn = ctx.getProp(module.value, 'calculateDiscount'); handles.push(fn);
    if (ctx.typeof(fn) !== 'function') return { kind: 'invalid' };
    const a = argument(ctx, args[0]), b = argument(ctx, args[1]); handles.push(a, b);
    const result = ctx.callFunction(fn, ctx.undefined, a, b);
    if (result.error) {
      handles.push(result.error);
      const name = ctx.getProp(result.error, 'name'); handles.push(name);
      return { kind: 'throw', name: ctx.typeof(name) === 'string' && ctx.getString(name) === 'TypeError' ? 'TypeError' : 'Error' };
    }
    handles.push(result.value);
    if (ctx.typeof(result.value) !== 'number') return { kind: 'invalid' };
    const value = ctx.getNumber(result.value);
    return Number.isFinite(value) ? { kind: 'number', value } : { kind: 'invalid' };
  } catch { return { kind: 'invalid' }; }
  finally { for (const handle of handles.reverse()) handle.dispose(); ctx.dispose(); runtime.dispose(); }
}
try {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of process.stdin) {
    size += Buffer.byteLength(chunk); if (size > 96 * 1024) throw new Error(); chunks.push(Buffer.from(chunk));
  }
  const input = record(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  if (typeof input.source !== 'string' || Buffer.byteLength(input.source) > 64 * 1024 || !Array.isArray(input.cases) || input.cases.length !== 15) throw new Error();
  const source = input.source;
  const results = input.cases.map(raw => {
    const c = record(raw);
    if (typeof c.id !== 'string' || c.id.length > 80 || !Array.isArray(c.args) || c.args.length !== 2) throw new Error();
    return { id: c.id, ...evaluate(source, c.args as [Arg, Arg]) };
  });
  process.stdout.write(JSON.stringify(results));
} catch { process.exitCode = 1; }
