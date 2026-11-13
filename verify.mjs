#!/usr/bin/env node
/**
 * Reproducible verification for the agentic-environment presets.
 *
 * Mounts the REAL `@deepseek-ai/dsh-system-prompt`,
 * `@deepseek-ai/dsh-harness-dev-context` and `@deepseek-ai/dsh-persona`
 * plugins, opens one preset scope, chains an agent scope beneath it, and
 * assembles + renders the prompt for three cases:
 *
 *   1. env preset, default config  -> identity is the new text, dev-context
 *      sections/contexts are gone, no brand token anywhere.
 *   2. env preset, silenceDevContext: false -> still no brand token (proves the
 *      scrub layer handles the leftovers, with no "the the" doubling).
 *   3. baseline preset (no env row) -> brand text is STILL present (proves the
 *      shadowing did not leak into the global/deployment layer).
 *
 * Assertions are exact substring checks, not eyeballing. Any failure exits 1.
 *
 * Run from anywhere; the script locates the DSH installation itself:
 *
 *   node verify.mjs [path-to-dsh-installation]
 *
 * ESM does not honor NODE_PATH, and this filesystem disallows symlinks on the
 * shared storage, so it resolves each harness package's built entry to an
 * absolute file URL via createRequire rooted at the DSH installation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const HERE = path.dirname(new URL(import.meta.url).pathname);

/** Locate the dsh installation: explicit arg > DSH_HOME-relative > known path > PATH lookup. */
function locateDsh() {
  if (process.argv[2]) return process.argv[2];
  const candidates = [
    '/data/data/com.dsharnessmobile.shell/files/usr/lib/node_modules/@deepseek-ai/dsh',
  ];
  const require = createRequire(import.meta.url);
  try {
    // `dsh` on PATH -> <prefix>/lib/node_modules/@deepseek-ai/dsh
    const bin = require('child_process').execFileSync('which', ['dsh'], { encoding: 'utf8' }).trim();
    const real = fs.realpathSync(bin);
    candidates.unshift(path.resolve(path.dirname(real), '..', 'lib', 'node_modules', '@deepseek-ai', 'dsh'));
  } catch { /* PATH lookup is best-effort */ }
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'node_modules', '@deepseek-ai', 'dsh-system-prompt'))) return dir;
  }
  throw new Error('cannot locate the dsh installation; pass its path as the first argument');
}

const DSH = locateDsh();
const dshRequire = createRequire(path.join(DSH, 'package.json'));

/** Import one of the harness's ESM packages by its bare specifier. */
const importFromDsh = (spec) => import(pathToFileURL(dshRequire.resolve(spec)).href);
/** Import a sibling file of this script. */
const importLocal = (file) => import(pathToFileURL(path.join(HERE, file)).href);

const { Context, Service } = await importFromDsh('@deepseek-ai/cordis');
const SystemPrompt = (await importFromDsh('@deepseek-ai/dsh-system-prompt')).default;
const { renderPrompt, renderContextSnapshot } = await importFromDsh('@deepseek-ai/dsh-system-prompt');
const { createScope } = await importFromDsh('@deepseek-ai/dsh-scope');
const HarnessDevContext = await importFromDsh('@deepseek-ai/dsh-harness-dev-context');
const Persona = await importFromDsh('@deepseek-ai/dsh-persona');
const { DEFAULT_REPLACEMENTS, apply: envApply, inject: envInject, name: envName } =
  await importLocal('index.js');

/**
 * Minimal Host stubs for the services `dsh-harness-dev-context` injects.
 * `webApp.getAdvertisedUrl()` is what produces the GUI-URL runtime context.
 */
class WebAppStub extends Service {
  constructor(ctx) { super(ctx, 'webApp'); }
  getAdvertisedUrl() { return 'http://127.0.0.1:4145'; }
}
class ProjectionsStub extends Service {
  constructor(ctx) { super(ctx, 'sessionProjections'); }
  register(def) { return { stateOf: () => def.init() }; }
}

/**
 * Simulate the third class of brand source: passing prose in a framework
 * text. The REAL `dsh-sandbox-policy` is a Host service fed by a session
 * policy object; registering its exact published text directly as a prompt
 * context is the faithful, dependency-light equivalent for an assembly test.
 */
function sandboxPolicyContext(ctx) {
  ctx.systemPrompt.context({
    name: 'sandbox:policy',
    order: ctx.systemPrompt.getContextOrder('SANDBOX_POLICY'),
    text: 'Current DSH file policy: danger-full-access. The DSH file sandbox does not restrict file modifications by available operations.',
  });
}
sandboxPolicyContext.inject = ['systemPrompt'];

/**
 * Compose one case and render it.
 *
 * `presetKey` is the standing preset scope; `agentKey` is chained beneath it
 * via `createScope(ctx, agentKey, { parent: presetKey })`, exactly like
 * `dsh-agent-presets` does with `bindScopeParent`.
 */
async function compose({ branch, identity, silence, replacements }) {
  const ctx = new Context();
  ctx.plugin(SystemPrompt, { personaPrefix: '' });
  ctx.plugin(WebAppStub);
  ctx.plugin(ProjectionsStub);
  await tick();
  // Global owners of the brand text.
  ctx.plugin(HarnessDevContext);
  ctx.plugin(sandboxPolicyContext);
  await tick();

  const presetKey = {};
  const agentKey = {};
  const presetScope = createScope(ctx, presetKey);
  presetScope.ctx.plugin(Persona, { prefix: 'You are a coding agent powered by the {{model}} model.' });
  if (branch) {
    presetScope.ctx.plugin(
      { apply: envApply, inject: envInject, name: envName },
      { identity, silenceDevContext: silence, replacements },
    );
  }
  await tick();
  createScope(ctx, agentKey, { parent: presetKey });
  await tick();

  const assembly = await ctx.systemPrompt.assemble({ scope: agentKey });
  // The loop supplies `model`; renderPrompt interpolates it in the persona.
  assembly.variables = { ...assembly.variables, model: 'deepseek-v4.1-flash' };
  return {
    prompt: renderPrompt(assembly),
    context: renderContextSnapshot(assembly),
    assembly,
  };
}

/** Let Cordis fibers activate (the real Loader awaits these too). */
const tick = () => new Promise((r) => setTimeout(r, 60));

/** Every brand PHRASE the model could see, checked as exact substrings. */
const BRAND_TOKENS = [
  'DeepSeek Harness',
  'DSH file policy',
  'DSH file sandbox',
  'extend DSH itself',
];
function leaks(text) { return BRAND_TOKENS.filter((t) => text.includes(t)); }

const IDENTITY = 'You are an AI coding agent working inside an agentic coding environment.';
const cases = [
  {
    label: 'env preset (default config)',
    branch: true,
    identity: IDENTITY,
    silence: true,
    replacements: DEFAULT_REPLACEMENTS,
    // identity replaced, maintenance sections+contexts silenced, all brand gone
    expect: { brand: 'absent', identity: 'present', maintenance: 'absent' },
  },
  {
    label: 'env preset (silenceDevContext: false)',
    branch: true,
    identity: IDENTITY,
    silence: false,
    replacements: DEFAULT_REPLACEMENTS,
    // maintenance paragraphs stay (that is what disabling silence means),
    // but the SCRUB layer must still remove every brand phrase from them,
    // with no "the the" doubling
    expect: { brand: 'absent', identity: 'present', maintenance: 'present' },
  },
  {
    label: 'baseline preset (no env row)',
    branch: false,
    // brand text must still be there: no leak into the global/deployment layer
    expect: { brand: 'present', identity: 'absent', maintenance: 'present' },
  },
];

let failed = 0;
for (const c of cases) {
  const out = await compose(c);
  const full = out.prompt + '\n' + out.context;
  const found = leaks(full);
  const hasIdentity = out.prompt.includes(IDENTITY);
  const hasMaintenance = /implementation checkout|Web GUI URL|runtime context names/i.test(full);
  const doubled = /\bthe the\b/i.test(full);

  const checks = {
    brand: (found.length > 0) === (c.expect.brand === 'present'),
    identity: hasIdentity === (c.expect.identity === 'present'),
    maintenance: hasMaintenance === (c.expect.maintenance === 'present'),
    noDoubledWord: !doubled,
  };
  const pass = Object.values(checks).every(Boolean);
  if (!pass) failed++;
  const detail = Object.entries(checks).map(([k, v]) => `${k}=${v ? 'ok' : 'FAIL'}`).join(' ');

  console.log(`\n===== ${c.label} =====`);
  console.log('--- prompt ---');
  console.log(out.prompt || '(empty)');
  console.log('--- runtime context snapshot ---');
  console.log(out.context || '(empty)');
  console.log('--- assembly sections (raw, incl. empty shadows) ---');
  console.log(out.assembly.sections.map((s) => `${s.name}: ${JSON.stringify(s.text)}`).join('\n'));
  console.log(`brand tokens found: ${found.length ? found.join(', ') : 'none'}`);
  console.log(`${detail}`);
  console.log(`ASSERTION: ${pass ? 'PASS' : 'FAIL'}`);
}

console.log(`\n${failed === 0 ? 'ALL 3 CASES PASS' : failed + ' CASE(S) FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
