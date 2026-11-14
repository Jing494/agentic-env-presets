#!/usr/bin/env node
/**
 * Robustness probe: the plugin must degrade to a no-op, never throw, in
 * deployments that lack the services or registry shapes it prefers.
 *
 * Cases:
 *   A. no `tools` service at all
 *   B. no `systemPrompt.layers` field (a future/other provider shape)
 *   C. a tool with no description; a context with empty text
 *   D. config.replacements = [] and bareToken = false (pure no-op)
 *   E. a context provider whose text() throws
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const HERE = path.dirname(new URL(import.meta.url).pathname);
/** Same discovery order as verify.mjs: explicit arg, PATH, then the known install. */
function locateDsh() {
  if (process.argv[2]) return process.argv[2];
  const candidates = ['/data/data/com.dsharnessmobile.shell/files/usr/lib/node_modules/@deepseek-ai/dsh'];
  const require = createRequire(import.meta.url);
  try {
    const bin = require('child_process').execFileSync('which', ['dsh'], { encoding: 'utf8' }).trim();
    candidates.unshift(path.resolve(path.dirname(fs.realpathSync(bin)), '..', 'lib', 'node_modules', '@deepseek-ai', 'dsh'));
  } catch { /* best-effort */ }
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'node_modules', '@deepseek-ai', 'dsh-system-prompt'))) return dir;
  }
  throw new Error('cannot locate the dsh installation; pass its path as the first argument');
}
const DSH = locateDsh();
const dshRequire = createRequire(path.join(DSH, 'package.json'));
const importFromDsh = (spec) => import(pathToFileURL(dshRequire.resolve(spec)).href);

const { Context } = await importFromDsh('@deepseek-ai/cordis');
const SystemPrompt = (await importFromDsh('@deepseek-ai/dsh-system-prompt')).default;
const { renderPrompt, renderContextSnapshot } = await importFromDsh('@deepseek-ai/dsh-system-prompt');
const { createScope } = await importFromDsh('@deepseek-ai/dsh-scope');
const env = await import(pathToFileURL(path.join(HERE, 'index.js')).href);

const tick = () => new Promise((r) => setTimeout(r, 60));
let failures = 0;

async function run(label, { withTools, extra, config }) {
  try {
    const ctx = new Context();
    ctx.plugin(SystemPrompt, { personaPrefix: '' });
    await tick();
    if (withTools) {
      const ToolsService = (await importFromDsh('@deepseek-ai/dsh-tools')).default;
      const Native = await importFromDsh('@deepseek-ai/dsh-tool-executor-native');
      ctx.plugin(ToolsService);
      await tick();
      ctx.plugin(Native);
      await tick();
      ctx.plugin({ inject: ['tools'], apply(c) {
        c.tools.register({ name: 'a', description: 'a DSH thing', parameters: { type: 'object', properties: {} },
          async execute() { return {}; }, output: { schema: { type: 'object' }, render: () => [] } });
        c.tools.register({ name: 'b', parameters: { type: 'object', properties: {} },
          async execute() { return {}; }, output: { schema: { type: 'object' }, render: () => [] } });
      } });
      await tick();
    }
    if (extra) { ctx.plugin(extra); await tick(); }

    const presetKey = {};
    const agentKey = {};
    createScope(ctx, presetKey).ctx.plugin(
      { apply: env.apply, inject: env.inject, name: env.name }, config ?? {},
    );
    await tick();
    createScope(ctx, agentKey, { parent: presetKey });
    await tick();

    const assembly = await ctx.systemPrompt.assemble({ scope: agentKey });
    assembly.variables = { ...assembly.variables, model: 'm' };
    const refreshed = ctx.systemPrompt.refreshContext(assembly, { scope: agentKey });
    const prompt = renderPrompt(refreshed);
    const context = renderContextSnapshot(refreshed);
    console.log(`  ${label}: OK  (prompt ${prompt.length}b, context ${context.length}b)`);
    return { ctx, agentKey, prompt, context, threw: false };
  } catch (error) {
    console.log(`  ${label}: THREW -> ${error.message}`);
    return { threw: true, message: error.message };
  }
}

console.log('A. no tools service');
await run('no tools', { withTools: false });

console.log('B. registry shape without layers.global');
await run('bare systemPrompt', {
  withTools: false,
  extra: { apply(c) { Object.defineProperty(c.systemPrompt, 'layers', { value: undefined, configurable: true }); } },
});

console.log('C. tool without description + empty context');
await run('sparse definitions', {
  withTools: true,
  extra: { inject: ['systemPrompt'], apply(c) { c.systemPrompt.context({ name: 'x:empty', order: 5, text: '' }); } },
});

console.log('C2. branded output.schema + a tool whose output is absent');
await run('output schemas', {
  withTools: true,
  extra: { inject: ['tools'], apply(c) {
    // A branded OUTPUT schema: scrubbed only for the PTC render path.
    c.tools.register({ name: 'with_output', description: 'ok', parameters: { type: 'object', properties: {} },
      async execute() { return {}; },
      output: { schema: { type: 'object', properties: { n: { type: 'string', description: 'DSH note' } } }, render: () => [] } });
    // No `output.schema` at all: the scrub must not invent one.
    c.tools.register({ name: 'bare_output', description: 'ok', parameters: { type: 'object', properties: {} },
      async execute() { return {}; }, output: { render: () => [] } });
  } },
});

console.log('D. pure no-op config');
await run('no-op config', { withTools: true, config: { replacements: [], bareToken: false } });

console.log('E. a context provider that throws — the throw must be the PROVIDER\'s, not ours');
const throwing = { inject: ['systemPrompt'], apply(c) { c.systemPrompt.context({ name: 'x:bad', order: 6, text: () => { throw new Error('boom'); } }); } };
const control = await run('control (no env preset)', { withTools: false, extra: throwing, config: { replacements: [], bareToken: false } });
const subject = await run('with env preset', { withTools: false, extra: throwing });
// Only a DIFFERENCE counts: our wrapper must not turn a working provider into a
// throwing one, nor change how a failing provider fails.
if (control?.threw !== subject?.threw || (control?.threw && control.message !== subject.message)) {
  failures++;
  console.log('  ^ MISMATCH: the preset changed failure behaviour');
} else if (control?.threw) {
  console.log('  ^ both threw identically: the pre-existing failure is not ours');
}

console.log(`\n${failures === 0 ? 'ROBUSTNESS: no case threw' : failures + ' CASE(S) THREW'}`);
process.exit(failures === 0 ? 0 : 1);
