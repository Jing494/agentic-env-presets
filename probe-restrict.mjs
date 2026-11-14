#!/usr/bin/env node
/**
 * Probe: does a PRESET-scoped tool shadow still obey a CHILD AGENT's
 * `tools.restrict()`?
 *
 * This is the "don't blow up DSH" question. A scoped re-registration lowers the
 * tool into an inherited layer; if it also bypassed restrictions, a preset that
 * scrubs descriptions would silently resurrect tools a subagent composition had
 * denied. Expected per the source (ToolsService.view: only the *own* layer
 * bypasses `admits`): restrictions still apply.
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
const ToolsService = (await importFromDsh('@deepseek-ai/dsh-tools')).default;
const NativeExecutor = await importFromDsh('@deepseek-ai/dsh-tool-executor-native');
const { createScope, scopeOf } = await importFromDsh('@deepseek-ai/dsh-scope');

const tick = () => new Promise((r) => setTimeout(r, 80));
const hasBrand = (s) => [/DeepSeek Harness/, /\bDSH\b/].some((re) => re.test(s ?? ''));
const scrub = (s) => (s ?? '').replace(/DeepSeek Harness/g, 'the environment').replace(/\bDSH\b/g, 'the environment');

const tool = (name, description) => ({
  name,
  description,
  parameters: { type: 'object', properties: {} },
  async execute() { return { ok: true }; },
  output: { schema: { type: 'object' }, render: () => [] },
});

const host = {
  inject: ['tools'],
  apply(ctx) {
    ctx.tools.register(tool('plugin_manager', 'Manage DSH plugins; unmet DSH version requirements block it.'));
    ctx.tools.register(tool('read', 'Read a file.'));
  },
};

const shim = {
  name: 'scrub',
  apply(ctx) {
    const tools = ctx.get('tools');
    const scope = scopeOf(ctx);
    const seen = new Set();
    const pass = () => {
      for (const [name, registration] of tools.view().registrations) {
        const def = registration.definition;
        if (!hasBrand(def.description) || seen.has(name)) continue;
        seen.add(name);
        ctx.effect(() => tools.register({ ...def, description: scrub(def.description) },
          registration.when === undefined ? {} : { when: registration.when }), `shadow ${name}`);
      }
    };
    pass();
    ctx.effect(() => ctx.on('tools/change', pass), 'rescan');
  },
};

const ctx = new Context();
ctx.plugin(SystemPrompt, { personaPrefix: '' });
ctx.plugin(ToolsService);
await tick();
ctx.plugin(NativeExecutor);
ctx.plugin(host);
await tick();

const presetKey = {};
createScope(ctx, presetKey).ctx.plugin(shim);
await tick();

// A plain agent of this preset: shadow visible, description scrubbed.
const plain = {};
createScope(ctx, plain, { parent: presetKey });
await tick();
const plainView = ctx.tools.view(plain);
console.log('plain agent plugin_manager:', JSON.stringify(plainView.visible.get('plugin_manager')?.description));

// A CHILD agent of the same preset that denies plugin_manager, like a subagent
// composition's toolFilter does.
const child = {};
const childScope = createScope(ctx, child, { parent: presetKey });
const restrictor = {
  inject: ['tools'],
  apply(c) { c.tools.restrict({ deny: ['plugin_manager'] }); },
};
childScope.ctx.plugin(restrictor);
await tick();

const childView = ctx.tools.view(child);
const stillVisible = childView.visible.has('plugin_manager');
console.log('child agent plugin_manager visible:', stillVisible);
console.log('child agent read visible:', childView.visible.has('read'));

if (stillVisible) {
  console.log('\nRESULT: shadow RESURRECTS a restricted tool -> do not ship this design as-is');
  process.exit(1);
}
console.log('\nRESULT: restriction still wins -> shadowing is safe for subagent tool filters');
process.exit(0);
