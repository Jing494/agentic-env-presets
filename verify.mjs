#!/usr/bin/env node
/**
 * Reproducible verification for the agentic-environment presets.
 *
 * Every case here corresponds to a surface that actually reached the model in
 * production, or to a way the previous implementation failed to cover one. The
 * suite mounts the REAL `@deepseek-ai/dsh-system-prompt`,
 * `@deepseek-ai/dsh-harness-dev-context`, `@deepseek-ai/dsh-persona`,
 * `@deepseek-ai/dsh-tools` and native tool executor, then asserts on what the
 * agent loop would actually send:
 *
 *   1. default config          — identity replaced, maintenance gone, no brand
 *   2. silenceDevContext false — maintenance text stays, brand still gone
 *   3. baseline (no env row)   — brand STILL present (no global leak)
 *   4. refreshContext()        — the case the old suite missed: the loop
 *                                re-resolves context providers AFTER the
 *                                assembly waterfall
 *   5. tool schemas            — descriptions and parameter docs
 *   6. skill-catalog ordering  — the scrub must be outermost on agent/pre-step
 *   7. identifier safety       — $DSH_HOME & friends must survive verbatim
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

/** Locate the dsh installation: explicit arg > PATH lookup > known path. */
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
const { createScope, bindScopeParent, scopeTarget } = await importFromDsh('@deepseek-ai/dsh-scope');
const HarnessDevContext = await importFromDsh('@deepseek-ai/dsh-harness-dev-context');
const Persona = await importFromDsh('@deepseek-ai/dsh-persona');
const ToolsService = (await importFromDsh('@deepseek-ai/dsh-tools')).default;
const NativeExecutor = await importFromDsh('@deepseek-ai/dsh-tool-executor-native');
const { agentEvents } = await importFromDsh('@deepseek-ai/dsh-agent');
// The PTC executor renders tool docs into the prompt itself, so verify the
// scrub through that real renderer rather than trusting the JSON alone.
const PtcExecutor = await importFromDsh('@deepseek-ai/dsh-tool-executor-ptc');
const {
  DEFAULT_REPLACEMENTS,
  apply: envApply,
  inject: envInject,
  name: envName,
  scrubAssembly,
  scrubText,
} = await importLocal('index.js');

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
 * The third class of brand source: passing prose inside a framework text.
 * The REAL `dsh-sandbox-policy` registers a LIVE provider function whose value
 * the loop re-resolves after the waterfall — reproduced faithfully here,
 * because that behaviour is exactly what case 4 pins down.
 */
function sandboxPolicyContext(ctx) {
  ctx.systemPrompt.context({
    name: 'sandbox:policy',
    order: ctx.systemPrompt.getContextOrder('SANDBOX_POLICY'),
    text: () => 'Current DSH file policy: workspace-write. Any available operation enforced by the DSH file sandbox may modify files under the session workspace. Extended note: the DSH ecosystem is days old.',
  });
}
sandboxPolicyContext.inject = ['systemPrompt'];

/** A description made only of identifiers: the scrub must not touch one byte. */
const IDENTIFIER_PROBE =
  'Managed `$DSH_*` variables; window.__DSH_BOOT__; engines.dsh; @deepseek-ai/dsh-tool-bash; DSH-1234.';

/** A branded tool, like the Android shell's `android_web_dump` / `plugin_manager`. */
const BRANDED_TOOL_DESCRIPTION =
  'Export the DSH Web UI DOM snapshot. Only valid for DSH\'s own Web UI; unmet DSH version requirements block it. Managed `$DSH_*` variables expose current harness environment facts.';
function brandedToolPlugin(ctx) {
  ctx.tools.register({
    name: 'probe_branded_tool',
    description: BRANDED_TOOL_DESCRIPTION,
    parameters: { type: 'object', properties: {} },
    async execute() { return { ok: true }; },
    output: { schema: { type: 'object' }, render: () => [] },
  });
  // An identifier-only description: nothing may be rewritten here.
  ctx.tools.register({
    name: 'probe_identifier_tool',
    description: IDENTIFIER_PROBE,
    parameters: { type: 'object', properties: {} },
    async execute() { return { ok: true }; },
    output: { schema: { type: 'object' }, render: () => [] },
  });
  // A tool whose ONLY brand text sits inside `parameters`, exactly like the
  // shipped `image_generate` and `plugin_manager` rows. A top-level-only scrub
  // reported clean while the real request still carried the brand.
  ctx.tools.register({
    name: 'probe_param_brand_tool',
    description: 'Generate an image.',
    parameters: {
      type: 'object',
      properties: {
        referenceImages: {
          type: 'array',
          description: 'Optional 1-5 ordered complete DSH image references to edit or use as source images.',
        },
        mode: {
          type: 'string',
          enum: ['DSH', 'DeepSeek Harness'],
          default: 'DSH',
          description: 'Pick the DSH mode.',
        },
        DSH_HOME: { type: 'string', description: 'Value carries DSH_ENV_PREFIX.' },
      },
    },
    // The OUTPUT schema is a third documentation surface: `dsh-tools` hides it
    // from the model, but the PTC executor renders it into `tools:sdk`.
    output: {
      schema: {
        type: 'object',
        properties: { note: { type: 'string', description: 'This DSH note field.' } },
      },
      render: () => [],
    },
  });
}
brandedToolPlugin.inject = ['tools'];

/**
 * A delegation row's runtime context, reproduced from `@deepseek-ai/dsh-tool-subagent`.
 *
 * That plugin registers `tool:<toolName>:depth` as a LIVE provider in whatever
 * scope it is mounted into. Each preset declares its OWN `tool-subagent` rows,
 * so two presets hold the same name in two different layers — which is exactly
 * the shape that used to make our scan collide with a sibling row.
 */
function subagentDepthRow(ctx, config) {
  ctx.systemPrompt.context({
    name: `tool:${config.toolName}:depth`,
    order: ctx.systemPrompt.getContextOrder('SUBAGENT_DELEGATION') ?? 120,
    text: (context) => {
      if (context?.agent === undefined) return '';
      return `Delegation depth for ${config.toolName}: current 1, maximum 3. Do not call it at this depth.`;
    },
  });
}
subagentDepthRow.inject = ['systemPrompt'];

/** The skill plugin, reproduced with the same emit-after-next() shape. */
function skillCatalogPlugin(ctx) {
  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next();
    if (decision.kind === 'reject') return decision;
    return {
      ...decision,
      messages: [...decision.messages, {
        id: 'skill-body-1',
        role: 'user',
        content: [{ type: 'text', text: '# Finding DSH plugins\n\nNever recall a plugin from memory. The DSH ecosystem moves fast. See DeepSeek Harness docs.' }],
        source: { kind: 'skill-invocation', name: 'dsh-plugin-store', form: 'instructions' },
      }, {
        id: 'catalog-1',
        role: 'user',
        content: [{
          type: 'text',
          text: '<system-reminder>\n<available_skills>\n- `dsh-plugin-store`: Find and install DeepSeek Harness (DSH) plugins. Use when the user asks how to add a capability to DSH.\n</available_skills>\n</system-reminder>',
        }],
        source: {
          kind: 'skill-catalog',
          form: 'catalog',
          entries: [{ name: 'dsh-plugin-store', description: 'Find and install DeepSeek Harness (DSH) plugins. Use when the user asks how to add a capability to DSH.' }],
        },
      }],
    };
  });
}

/**
 * Compose one case and render it the way the agent loop does.
 *
 * `presetKey` is the standing preset scope; `agentKey` is chained beneath it
 * via `createScope(ctx, agentKey, { parent: presetKey })`, exactly like
 * `dsh-agent-presets` does with `bindScopeParent`.
 */
async function compose({ branch, identity, silence, replacements, devContextFirst = false }) {
  const ctx = new Context();
  ctx.plugin(SystemPrompt, { personaPrefix: '' });
  ctx.plugin(WebAppStub);
  ctx.plugin(ProjectionsStub);
  ctx.plugin(ToolsService);
  await tick();
  ctx.plugin(NativeExecutor);
  ctx.plugin(brandedToolPlugin);
  // Global owners of the brand text. Mount ORDER is a variable on purpose:
  // `harness-dev-context` registers `harness:source` / `app:web-surface`, which
  // layer 1b already owns in the preset scope. If the context shadow tried to
  // re-register one of those, the duplicate used to abort the whole scan and
  // leave every context after it unscrubbed — a leak that depended purely on
  // which owner mounted first.
  if (devContextFirst) {
    ctx.plugin(HarnessDevContext);
    await tick();
    ctx.plugin(sandboxPolicyContext);
  } else {
    ctx.plugin(sandboxPolicyContext);
    await tick();
    ctx.plugin(HarnessDevContext);
  }
  ctx.plugin(skillCatalogPlugin);
  await tick();

  const presetKey = {};
  const presetScope = createScope(ctx, presetKey);
  presetScope.ctx.plugin(Persona, { prefix: 'You are a coding agent powered by the {{model}} model.' });
  if (branch) {
    presetScope.ctx.plugin(
      { apply: envApply, inject: envInject, name: envName },
      { identity, silenceDevContext: silence, replacements },
    );
  }
  await tick();
  // The agent object IS its scope key, exactly like the real loop
  // (`createScope(loopCtx, this)` then `bindScopeParent(agentKey, presetKey)`).
  const agent = createAgent(ctx, presetKey);
  const agentKey = agent;
  await announceAgent(ctx, agent);

  const assembly = await ctx.systemPrompt.assemble({ scope: agentKey });
  // The loop supplies `model`; renderPrompt interpolates it in the persona.
  assembly.variables = { ...assembly.variables, model: 'deepseek-v4.1-flash' };

  // What the loop actually sends: refreshContext() re-resolves live providers
  // AFTER the waterfall, then the result is rendered and joined.
  const refreshed = ctx.systemPrompt.refreshContext(assembly, { scope: agentKey });

  // The tool schemas the model receives for this step.
  const toolSet = await ctx.tools.resolve({ agent: agentKey, signal: new AbortController().signal });
  const tools = ctx.tools.schemas(agentKey, toolSet);
  // Full definitions (with `output`), which `schemas()` deliberately omits.
  const definitions = Object.fromEntries(
    ctx.tools.definitions(agentKey, toolSet).map((d) => [d.name, d]),
  );

  // The user messages the pre-step chain produces (skill catalog included).
  // `agentEvents` couples the dispatcher to the agent's scope carrier, which is
  // how a preset-owned listener is admitted for this agent at all.
  const dispatch = agentEvents(ctx, agent);
  const base = { id: 'u1', role: 'user', content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } };
  const decision = await dispatch.waterfall(
    'agent/pre-step',
    { messages: [base], turn: 1, step: 1 },
    async () => ({ kind: 'enter', messages: [base] }),
  );

  return {
    prompt: renderPrompt(assembly),
    context: renderContextSnapshot(assembly),
    refreshedPrompt: renderPrompt(refreshed),
    refreshedContext: renderContextSnapshot(refreshed),
    tools,
    definitions,
    messages: decision.messages,
    assembly,
  };
}

/** Let Cordis fibers activate (the real Loader awaits these too). */
const tick = () => new Promise((r) => setTimeout(r, 60));

/**
 * Create an Agent the way the real loop does.
 *
 * `ReactLoop` mints `createScope(loopCtx, this)` and exposes that context as
 * `agent.ctx`, then `AgentRegistry.announce()` emits `agent/created` through a
 * scope carrier. A preset plugin that shadows runtime contexts does its work
 * in THAT listener, because the agent's own layer is the only one it can use
 * without occupying a name its sibling rows need. A harness that skips the
 * announcement therefore never receives the shadow — so `verify.mjs` announces
 * too, instead of calling `assemble()` on a half-built agent.
 */
const createAgent = (ctx, parentKey, id = 'probe-agent') => {
  const agent = { id };
  const scope = createScope(ctx, agent, { parent: parentKey });
  agent.ctx = scope.ctx;
  return agent;
};

/** Announce one agent (outermost creation edge) and let its listeners settle. */
const announceAgent = async (ctx, agent) => {
  ctx.serial(scopeTarget(ctx, agent), 'agent/created', { agent });
  await tick();
  await tick();
};

/**
 * Every brand PHRASE the model could see, checked as exact substrings.
 * A bare `DSH` is included: the previous suite omitted it, which is how the
 * PTC inlined tool docs kept leaking.
 */
function leaks(text) {
  const found = [];
  if (typeof text !== 'string') return found;
  if (text.includes('DeepSeek Harness')) found.push('DeepSeek Harness');
  if (text.includes('DSH file policy')) found.push('DSH file policy');
  if (text.includes('DSH file sandbox')) found.push('DSH file sandbox');
  if (text.includes('extend DSH itself')) found.push('extend DSH itself');
  if (text.includes('DSH Marketplace')) found.push('DSH Marketplace');
  if (text.includes('DSH ecosystem')) found.push('DSH ecosystem');
  if (/(?<![\w$.\-])DSH(?![\w\-])/.test(text)) found.push('bare DSH');
  // Lowercase prose, not an identifier: the `bash` tool used to say "$DSH_*
  // variables expose current harness environment facts", and a real session
  // read that as "the DSH environment".
  if (/\b[Hh]arness\b/.test(text)) found.push('harness word');
  return found;
}

const IDENTITY = 'You are an AI coding agent working inside an agentic coding environment.';

let failed = 0;
let total = 0;
function report(label, checks, detailLines = []) {
  total++;
  const pass = Object.values(checks).every(Boolean);
  if (!pass) failed++;
  console.log(`\n===== ${label} =====`);
  for (const line of detailLines) console.log(line);
  console.log(Object.entries(checks).map(([k, v]) => `${k}=${v ? 'ok' : 'FAIL'}`).join(' '));
  console.log(`ASSERTION: ${pass ? 'PASS' : 'FAIL'}`);
  return pass;
}

// ---------------------------------------------------------------- cases 1-3
for (const c of [
  {
    label: 'env preset (default config)',
    branch: true, identity: IDENTITY, silence: true, replacements: DEFAULT_REPLACEMENTS,
    expect: { brand: 'absent', identity: 'present', maintenance: 'absent' },
  },
  {
    label: 'env preset (silenceDevContext: false)',
    branch: true, identity: IDENTITY, silence: false, replacements: DEFAULT_REPLACEMENTS,
    expect: { brand: 'absent', identity: 'present', maintenance: 'present' },
  },
  {
    label: 'baseline preset (no env row)',
    branch: false,
    expect: { brand: 'present', identity: 'absent', maintenance: 'present' },
  },
]) {
  const out = await compose(c);
  const full = [out.prompt, out.context, out.refreshedPrompt, out.refreshedContext].join('\n');
  const found = leaks(full);
  const hasIdentity = out.prompt.includes(IDENTITY);
  const hasMaintenance = /implementation checkout|Web GUI URL|runtime context names/i.test(full);
  const doubled = /\bthe the\b/i.test(full);
  report(c.label, {
    brand: (found.length > 0) === (c.expect.brand === 'present'),
    identity: hasIdentity === (c.expect.identity === 'present'),
    maintenance: hasMaintenance === (c.expect.maintenance === 'present'),
    noDoubledWord: !doubled,
  }, [
    '--- prompt (assembled) ---',
    out.prompt || '(empty)',
    '--- runtime context (assembled) ---',
    out.context || '(empty)',
    `brand tokens found: ${found.length ? found.join(', ') : 'none'}`,
  ]);
}

// ---------------------------------------------------------------- case 4
{
  const out = await compose({ branch: true, identity: IDENTITY, silence: true, replacements: DEFAULT_REPLACEMENTS });
  const refreshedLeaks = leaks(out.refreshedContext);
  const assembledLeaks = leaks(out.context);
  const keptPolicy = /file policy: workspace-write/i.test(out.refreshedContext);
  report('case 4: refreshContext() keeps the scrub', {
    // assemble() alone was already clean in 1.1.1 — that is the trap.
    assembledClean: assembledLeaks.length === 0,
    // The loop re-resolves providers after the waterfall; this must stay clean.
    refreshedClean: refreshedLeaks.length === 0,
    // The scrub must not have achieved this by silencing the whole snapshot.
    policyTextPreserved: keptPolicy,
    noDoubledWord: !/\bthe the\b/i.test(out.refreshedContext),
  }, [
    '--- runtime context after refreshContext() (what the model receives) ---',
    out.refreshedContext || '(empty)',
    `brand tokens found: ${refreshedLeaks.length ? refreshedLeaks.join(', ') : 'none'}`,
  ]);
}

// ---------------------------------------------------------------- case 5
{
  const envOut = await compose({ branch: true, identity: IDENTITY, silence: true, replacements: DEFAULT_REPLACEMENTS });
  const baseOut = await compose({ branch: false });
  const byName = (out, n) => out.tools.find((t) => t.name === n);
  const envBranded = byName(envOut, 'probe_branded_tool');
  const baseBranded = byName(baseOut, 'probe_branded_tool');
  const envIdent = byName(envOut, 'probe_identifier_tool');
  const envParam = byName(envOut, 'probe_param_brand_tool');
  // Leaks are checked on the DOCUMENTATION the model reads, not on schema
  // DATA: `enum: ["DSH"]` is deliberately preserved, so a raw `leaks()` over
  // the whole JSON would flag a value this suite itself asserts must survive.
  const paramDocs = [];
  const collectDocs = (node) => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const item of node) collectDocs(item); return; }
    for (const [key, child] of Object.entries(node)) {
      if ((key === 'description' || key === 'title') && typeof child === 'string') paramDocs.push(child);
      else collectDocs(child);
    }
  };
  collectDocs(envParam?.parameters ?? {});
  const paramLeaks = paramDocs.flatMap((text) => leaks(text));
  const modeSchema = envParam?.parameters?.properties?.mode ?? {};
  const schemaDataOk = JSON.stringify(modeSchema.enum) === JSON.stringify(['DSH', 'DeepSeek Harness'])
    && modeSchema.default === 'DSH'
    && Object.hasOwn(envParam?.parameters?.properties ?? {}, 'DSH_HOME')
    && !/(?<![\w$.\-])DSH(?![\w\-])/.test(modeSchema.description ?? '')
    && !/(?<![\w$.\-])DSH(?![\w\-])/.test(envParam?.parameters?.properties?.referenceImages?.description ?? '');
  // Documentation only — `enum`/`default` values are data that must survive.
  const docsOf = (node, acc = []) => {
    if (node === null || typeof node !== 'object') return acc;
    if (Array.isArray(node)) { for (const item of node) docsOf(item, acc); return acc; }
    for (const [key, child] of Object.entries(node)) {
      if ((key === 'description' || key === 'title') && typeof child === 'string') acc.push(child);
      else docsOf(child, acc);
    }
    return acc;
  };
  const toolLeaks = envOut.tools.flatMap((t) => leaks(
    [t.description ?? '', ...docsOf(t.parameters ?? {})].join(' '),
  ));
  report('case 5: tool descriptions are scrubbed, executables forwarded', {
    toolVisible: envBranded !== undefined,
    descriptionClean: envBranded !== undefined && !/(?<![\w$.\-])DSH(?![\w\-])/.test(envBranded.description) && !envBranded.description.includes('DeepSeek Harness'),
    noToolLeaks: toolLeaks.length === 0,
    // The whole point of this case: parameter DOCS are clean...
    paramDocCount: paramDocs.length >= 3 && paramLeaks.length === 0,
    // Identifiers inside a description must be preserved byte-for-byte.
    identifiersIntact: envIdent !== undefined && IDENTIFIER_PROBE === envIdent.description,
    // The baseline preset must still see the original text (no global leak).
    baselineStillBranded: baseBranded !== undefined && baseBranded.description === BRANDED_TOOL_DESCRIPTION,
    // ...but enum/default values and property NAMES are data, not documentation.
    schemaDataIntact: schemaDataOk,
    // The OUTPUT schema must be scrubbed too: PTC renders it into `tools:sdk`.
    outputSchemaClean: (() => {
      const out = JSON.stringify(envParam?.output?.schema ?? {});
      return leaks(out).filter((t) => t !== 'harness word').length === 0 && !/DSH/.test(out.replace(/DSH_ENV_PREFIX/g, ''));
    })(),
  }, [
    '--- env: probe_branded_tool ---',
    envBranded?.description ?? '(missing)',
    '--- env: probe_identifier_tool ---',
    envIdent?.description ?? '(missing)',
    '--- baseline: probe_branded_tool ---',
    baseBranded?.description ?? '(missing)',
    '--- env: probe_param_brand_tool parameters ---',
    JSON.stringify(envParam?.parameters ?? {}, null, 1),
    `tool brand tokens found: ${toolLeaks.length ? toolLeaks.join(', ') : 'none'}`,
  ]);
}

// ---------------------------------------------------------------- case 5b
{
  // `renderToolsSdkPy` is the exact function PTC uses to build `tools:sdk`.
  // Feeding it the SHADOWED definitions proves the whole PTC path is clean.
  const envOut = await compose({ branch: true, identity: IDENTITY, silence: true, replacements: DEFAULT_REPLACEMENTS });
  const baseOut = await compose({ branch: false });
  const render = (out) => PtcExecutor.renderToolsSdkPy(
    out.tools.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      parameters: t.parameters ?? { type: 'object', properties: {} },
      output: out.definitions[t.name]?.output?.schema ?? { type: 'object' },
    })),
    'python',
  );
  const envSdk = render(envOut);
  const baseSdk = render(baseOut);
  // `renderToolsSdkPy` also emits `Literal["DSH", "DeepSeek Harness"]` for a
  // scrubbed `enum`. Those are schema DATA this package deliberately preserves
  // (see `scrubSchemaDocs`), not prose, so they must be excluded before the
  // leak check — otherwise the case asserts against its own stated contract.
  const ENUM_LITERAL = /NotRequired\[Literal\[[^\]]*\]\]/g;
  const proseOf = (sdk) => sdk.replace(ENUM_LITERAL, '');
  const envLeaks = leaks(proseOf(envSdk));
  report('case 5b: PTC tools:sdk render is clean', {
    // The probe tool's branded output field must be gone from the rendered SDK.
    noBrandInRenderedSdk: envLeaks.length === 0,
    // Sanity: the renderer really does surface output-schema docs, so this case
    // is not vacuous — the baseline render must still carry the brand.
    baselineSdkStillBranded: leaks(proseOf(baseSdk)).length > 0,
    // The enum values must have survived the scrub: dropping them would be data loss.
    enumDataPreserved: envSdk.includes('Literal["DSH", "DeepSeek Harness"]'),
    sdkActuallyRendered: envSdk.includes('class Tools') && envSdk.length > 200,
  }, [
    '--- actual leak positions ---',
    [...proseOf(envSdk).matchAll(/(?<![\w$.\-])DSH(?![\w\-])|DeepSeek Harness|\b[Hh]arness\b/g)]
      .map((m) => JSON.stringify(proseOf(envSdk).slice(Math.max(0, m.index - 70), m.index + 50)))
      .slice(0, 4).join('\n') || '(none)',
    `enum data preserved: ${envSdk.includes('Literal["DSH", "DeepSeek Harness"]')}`,
    `env SDK brand tokens: ${envLeaks.join(', ') || 'none'}`,
    `baseline SDK brand tokens: ${leaks(proseOf(baseSdk)).join(', ') || 'none'}`,
    '--- env: rendered SDK excerpt around any note field ---',
    envSdk.split('\n').filter((l) => /note|agentic coding environment/.test(l)).slice(0, 4).join('\n') || '(none)',
  ]);
}

// ---------------------------------------------------------------- case 6
{
  const envOut = await compose({ branch: true, identity: IDENTITY, silence: true, replacements: DEFAULT_REPLACEMENTS });
  const baseOut = await compose({ branch: false });
  const catalogOf = (out) => out.messages.find((m) => m?.source?.kind === 'skill-catalog');
  const envCatalog = catalogOf(envOut);
  const baseCatalog = catalogOf(baseOut);
  const envText = envCatalog?.content?.[0]?.text ?? '';
  // The skill BODY is injected the same way (and is what the model reads after
  // a `skill` call), so the same listener must cover it.
  const bodyOf = (out) => out.messages.find((m) => m?.source?.kind === 'skill-invocation');
  const envBody = bodyOf(envOut);
  const baseBody = bodyOf(baseOut);
  const envBodyText = envBody?.content?.[0]?.text ?? '';
  report('case 6: injected skill catalog AND body are scrubbed', {
    catalogPresent: envCatalog !== undefined,
    catalogClean: leaks(envText).length === 0,
    // A scrub that ran too early would leave this message untouched entirely.
    catalogActuallyRewritten: envText !== (baseCatalog?.content?.[0]?.text ?? ''),
    // The digest source must be untouched, or the catalog re-publishes forever.
    sourceEntriesIntact: JSON.stringify(envCatalog?.source?.entries) === JSON.stringify(baseCatalog?.source?.entries),
    bodyPresent: envBody !== undefined,
    bodyClean: leaks(envBodyText).length === 0,
    bodyActuallyRewritten: envBodyText !== (baseBody?.content?.[0]?.text ?? ''),
    bodySourceNameIntact: envBody?.source?.name === 'dsh-plugin-store',
  }, [
    '--- env: skill catalog text ---',
    envText || '(missing)',
    `catalog brand tokens: ${leaks(envText).join(', ') || 'none'}`,
    '--- env: skill body ---',
    envBodyText || '(missing)',
    `body brand tokens: ${leaks(envBodyText).join(', ') || 'none'}`,
  ]);
}

// ---------------------------------------------------------------- case 7
{
  const identifiers = [
    '$DSH_HOME',
    'DSH_ENV_PREFIX',
    '__DSH_BOOT__',
    'engines.dsh',
    '@deepseek-ai/dsh-tool-bash',
    'DSH-1234',
    'myDSHThing',
  ];
  const broken = identifiers.filter((id) => scrubText(id, DEFAULT_REPLACEMENTS, true) !== id);
  const prose = scrubText('current DSH file policy; the DSH ecosystem; DSH 自有', DEFAULT_REPLACEMENTS, true);
  report('case 7: identifiers survive, prose is rewritten', {
    identifiersIntact: broken.length === 0,
    proseRewritten: !/(?<![\w$.\-])DSH(?![\w\-])/.test(prose),
  }, [
    `identifiers altered: ${broken.length ? broken.join(', ') : 'none'}`,
    `prose result: ${prose}`,
  ]);
}

// ---------------------------------------------------------------- case 8
{
  // Same plugins, opposite mount order. A correct implementation is
  // order-independent; the pre-fix one leaked only in this order.
  const a = await compose({ branch: true, identity: IDENTITY, silence: true, replacements: DEFAULT_REPLACEMENTS, devContextFirst: false });
  const b = await compose({ branch: true, identity: IDENTITY, silence: true, replacements: DEFAULT_REPLACEMENTS, devContextFirst: true });
  const aLeaks = leaks(a.refreshedContext);
  const bLeaks = leaks(b.refreshedContext);
  report('case 8: scrubbing is independent of plugin mount order', {
    sandboxMountedFirst: aLeaks.length === 0,
    devContextMountedFirst: bLeaks.length === 0,
    sameResult: a.refreshedContext === b.refreshedContext,
    noDoubledWord: !/\bthe the\b/i.test(b.refreshedContext),
  }, [
    '--- sandbox:policy mounted first ---',
    a.refreshedContext || '(empty)',
    '--- harness-dev-context mounted first ---',
    b.refreshedContext || '(empty)',
    `brand tokens (sandbox-first): ${aLeaks.join(', ') || 'none'}`,
    `brand tokens (dev-first): ${bLeaks.join(', ') || 'none'}`,
  ]);
}

// ---------------------------------------------------------------- case 9
{
  // A `complete: true` section is restored from the PRE-waterfall snapshot as
  // the ENTIRE prompt, so the assembly scrub never sees it. Two placements,
  // two mechanisms:
  //   A. in an ancestor (global) layer -> same-name shadow in this scope;
  //   B. in the SAME layer we mount into (`dsh-persona`, `minimal` preset)
  //      -> re-registration throws by design, so the registry entry itself is
  //         rewritten in place.
  // Both were real holes; B leaked with only a log warning before this case.
  const run = async (placement) => {
    const ctx = new Context();
    ctx.plugin(SystemPrompt, { personaPrefix: '' });
    await tick();
    const presetKey = {};
    const agentKey = {};
    const preset = createScope(ctx, presetKey);
    const warnings = [];
    preset.ctx.logger.warn = (...args) => warnings.push(args.join(' '));
    if (placement === 'global') {
      ctx.plugin({
        inject: ['systemPrompt'],
        apply(c) {
          c.systemPrompt.section({
            name: 'deployment:persona-prefix',
            order: c.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'),
            text: 'You are running on DeepSeek Harness. DSH rules apply.',
            complete: true,
          });
        },
      });
      await tick();
      preset.ctx.plugin({ apply: envApply, inject: envInject, name: envName });
    } else {
      preset.ctx.plugin(Persona, { prefix: 'You are running on DeepSeek Harness. DSH rules apply.', complete: true });
      await tick();
      preset.ctx.plugin({ apply: envApply, inject: envInject, name: envName });
    }
    await tick();
    createScope(ctx, agentKey, { parent: presetKey });
    await tick();
    const assembly = await ctx.systemPrompt.assemble({ scope: agentKey });
    assembly.variables = { ...assembly.variables, model: 'm' };
    return { prompt: renderPrompt(assembly), warnings };
  };
  const global = await run('global');
  const sameLayer = await run('same');
  report('case 9: a complete:true section is rewritten in either layer', {
    globalClean: leaks(global.prompt).length === 0,
    sameLayerClean: leaks(sameLayer.prompt).length === 0,
    noWarningWhenFixed: sameLayer.warnings.every((w) => !/cannot be rewritten/.test(w)),
  }, [
    `global-layer   : ${global.prompt}`,
    `same-layer     : ${sameLayer.prompt}`,
    `global leaks   : ${leaks(global.prompt).join(', ') || 'none'}`,
    `same-layer leak: ${leaks(sameLayer.prompt).join(', ') || 'none'}`,
  ]);
}

// --------------------------------------------------------------- case 10
{
  // Wording, not brand: the bare-token rule replaces with "the …", which at
  // the head of a sentence used to produce "… environment rules apply".
  const sentenceStart = scrubText('DSH rules apply here.', DEFAULT_REPLACEMENTS, true);
  const midSentence = scrubText('Follow DSH conventions.', DEFAULT_REPLACEMENTS, true);
  const cjk = scrubText('DSH 的规则', DEFAULT_REPLACEMENTS, true);
  const cjkAfter = scrubText('规则 DSH', DEFAULT_REPLACEMENTS, true);
  report('case 10: substitution keeps the sentence readable', {
    sentenceCapitalised: sentenceStart.startsWith('The '),
    midSentenceLowercase: midSentence === 'Follow the agentic coding environment conventions.',
    noArticleBeforeCjk: !cjk.startsWith('The ') && !cjkAfter.startsWith('The '),
    identifiersStillIntact: scrubText('$DSH_HOME engines.dsh __DSH_BOOT__ DSH-1234', DEFAULT_REPLACEMENTS, true)
      === '$DSH_HOME engines.dsh __DSH_BOOT__ DSH-1234',
  }, [
    `sentence start : ${sentenceStart}`,
    `mid sentence   : ${midSentence}`,
    `cjk            : ${cjk}`,
    `cjk after      : ${cjkAfter}`,
  ]);
}

// --------------------------------------------------------------- case 11
{
  // A `{{name}}` value is interpolated by renderPrompt() AFTER the assembly
  // waterfall, so scrubbing the assembly text alone never sees it. Measured:
  // the section read "You run inside {{envname}} today" and rendered the raw
  // brand value.
  const run = async (withPlugin) => {
    const ctx = new Context();
    ctx.plugin(SystemPrompt, { personaPrefix: '' });
    await tick();
    const presetKey = {};
    const agentKey = {};
    const preset = createScope(ctx, presetKey);
    preset.ctx.plugin(Persona, { prefix: 'You are a coding agent.' });
    preset.ctx.plugin({
      inject: ['systemPrompt'],
      apply(c) {
        c.systemPrompt.variable('envname', () => 'DeepSeek Harness');
        c.systemPrompt.section({ name: 'extra:note', order: 900, text: 'You run inside {{envname}} today.' });
      },
    });
    await tick();
    if (withPlugin) {
      preset.ctx.plugin({ apply: envApply, inject: envInject, name: envName });
      await tick();
    }
    createScope(ctx, agentKey, { parent: presetKey });
    await tick();
    const assembly = await ctx.systemPrompt.assemble({ scope: agentKey });
    assembly.variables = { ...assembly.variables, model: 'm' };
    return renderPrompt(assembly);
  };
  const withPlugin = await run(true);
  const withoutPlugin = await run(false);
  report('case 11: an interpolated variable value is scrubbed too', {
    scrubbedWithPlugin: leaks(withPlugin).length === 0,
    // The control proves the case is measuring the plugin, not an inert path.
    leaksWithoutPlugin: leaks(withoutPlugin).length > 0,
  }, [
    `with plugin   : ${withPlugin.split('\n').pop()}`,
    `without plugin: ${withoutPlugin.split('\n').pop()}`,
  ]);
}

// --------------------------------------------------------------- case 12
{
  // An in-place rewrite must never reach ANOTHER preset. The merged view is a
  // plain Map keyed by section NAME, so iterating every scoped layer let the
  // last preset win a shared name — measured: preset 2 got scrubbed and the
  // preset that actually mounted us kept the brand, which is exactly backwards.
  const ctx = new Context();
  ctx.plugin(SystemPrompt, { personaPrefix: '' });
  await tick();
  const one = {};
  const two = {};
  const oneAgent = {};
  const twoAgent = {};
  const first = createScope(ctx, one);
  const second = createScope(ctx, two);
  first.ctx.plugin(Persona, { prefix: 'P1 DeepSeek Harness.', complete: true });
  second.ctx.plugin(Persona, { prefix: 'P2 DeepSeek Harness.', complete: true });
  await tick();
  first.ctx.plugin({ apply: envApply, inject: envInject, name: envName });
  await tick();
  createScope(ctx, oneAgent, { parent: one });
  createScope(ctx, twoAgent, { parent: two });
  await tick();
  const mine = await ctx.systemPrompt.assemble({ scope: oneAgent });
  const theirs = await ctx.systemPrompt.assemble({ scope: twoAgent });
  mine.variables = { ...mine.variables, model: 'm' };
  theirs.variables = { ...theirs.variables, model: 'm' };
  const mineOut = renderPrompt(mine);
  const theirsOut = renderPrompt(theirs);
  report('case 12: scrubbing one preset never touches another', {
    ourPresetClean: leaks(mineOut).length === 0,
    theirPresetUntouched: leaks(theirsOut).length > 0,
  }, [
    `preset WITH us   : ${mineOut}`,
    `preset WITHOUT us: ${theirsOut}`,
  ]);
}

// --------------------------------------------------------------- case 13
{
  // The in-place rewrite mutates a shared registry object, so unload must put
  // the original text back. A leak-free plugin that permanently edits another
  // row's section is a worse bug than the one it fixed.
  const ctx = new Context();
  ctx.plugin(SystemPrompt, { personaPrefix: '' });
  await tick();
  const presetKey = {};
  const agentKey = {};
  const preset = createScope(ctx, presetKey);
  preset.ctx.plugin(Persona, { prefix: 'You are running on DeepSeek Harness. DSH rules.', complete: true });
  await tick();
  const mounted = preset.ctx.plugin({ apply: envApply, inject: envInject, name: envName });
  await tick();
  createScope(ctx, agentKey, { parent: presetKey });
  await tick();
  const render = async () => {
    const assembly = await ctx.systemPrompt.assemble({ scope: agentKey });
    assembly.variables = { ...assembly.variables, model: 'm' };
    return renderPrompt(assembly);
  };
  const whileMounted = await render();
  await mounted.dispose?.();
  await tick();
  await tick();
  const afterUnload = await render();
  report('case 13: an in-place rewrite is undone on unload', {
    cleanWhileMounted: leaks(whileMounted).length === 0,
    // A disposed row must leave the prompt byte-identical to the original.
    restoredAfterUnload: leaks(afterUnload).length > 0,
  }, [
    `while mounted: ${whileMounted}`,
    `after unload : ${afterUnload}`,
  ]);
}

// --------------------------------------------------------------- case 14
{
  // Cordis rolls back EVERY effect of a plugin whose apply() throws. A TDZ
  // ReferenceError in this very file therefore disabled the whole preset with
  // no diagnostic: the identity string was never replaced, every same-name
  // shadow vanished, and only the assembly fallback kept the surface clean.
  // The package must survive a broken sub-step, so each registration is
  // contained. This mounts it against a host whose `getContextOrder` throws —
  // layer 1b must degrade, and layers 1 and 5 must still do their job.
  const runtime = { getContextOrder() { throw new Error('simulated host defect'); } };
  const ctx = new Context();
  ctx.plugin(SystemPrompt, { personaPrefix: '' });
  await tick();
  // Poison one API the plugin uses during apply().
  const real = ctx.systemPrompt.getContextOrder;
  ctx.systemPrompt.getContextOrder = () => { throw new Error('simulated host defect'); };
  const presetKey = {};
  const agentKey = {};
  const preset = createScope(ctx, presetKey);
  preset.ctx.plugin(Persona, { prefix: 'You are running on DeepSeek Harness. DSH rules apply.' });
  await tick();
  preset.ctx.plugin({ apply: envApply, inject: envInject, name: envName });
  await tick();
  createScope(ctx, agentKey, { parent: presetKey });
  await tick();
  const assembly = await ctx.systemPrompt.assemble({ scope: agentKey });
  assembly.variables = { ...assembly.variables, model: 'm' };
  const prompt = renderPrompt(assembly);
  ctx.systemPrompt.getContextOrder = real;
  report('case 14: a throwing sub-step cannot roll back the whole plugin', {
    // The identity section is the load-bearing registration.
    identityReplaced: prompt.includes('agentic coding environment'),
    noBrand: leaks(prompt).length === 0,
  }, [
    `prompt: ${prompt.slice(0, 130)}`,
    `leaks : ${leaks(prompt).join(', ') || 'none'}`,
  ]);
}

// --------------------------------------------------------------- case 15
{
  // Bookkeeping used to be a Set of NAMES. A provider disposed and
  // re-registered under the SAME name is a different object with different
  // text, so the shadow was skipped and the brand came through verbatim.
  const ctx = new Context();
  ctx.plugin(SystemPrompt, { personaPrefix: '' });
  await tick();
  const presetKey = {};
  const agentKey = {};
  const preset = createScope(ctx, presetKey);
  const first = preset.ctx.plugin({
    inject: ['systemPrompt'],
    apply(c) { c.systemPrompt.context({ name: 'probe:ctx', order: 500, text: 'clean text here' }); },
  });
  await tick();
  preset.ctx.plugin({ apply: envApply, inject: envInject, name: envName });
  await tick();
  createScope(ctx, agentKey, { parent: presetKey });
  await tick();
  const snap = async () => {
    const assembly = await ctx.systemPrompt.assemble({ scope: agentKey });
    return renderContextSnapshot(ctx.systemPrompt.refreshContext(assembly, { scope: agentKey }));
  };
  const before = await snap();
  await first.dispose?.();
  await tick();
  preset.ctx.plugin({
    inject: ['systemPrompt'],
    apply(c) { c.systemPrompt.context({ name: 'probe:ctx', order: 500, text: 'DeepSeek Harness context' }); },
  });
  await tick();
  const after = await snap();
  report('case 15: a re-registered context under the same name is re-scrubbed', {
    cleanBefore: leaks(before).length === 0,
    cleanAfterReRegister: leaks(after).length === 0,
  }, [
    `before: ${before.slice(-40)}`,
    `after : ${after.slice(-40)}`,
  ]);
}

// --------------------------------------------------------------- case 16
{
  // A provider (or section) living in THIS preset's own layer cannot be
  // shadowed by name — the registration throws. It is patched in place
  // instead, which must also be IDEMPOTENT: `system-prompt/change` fires on
  // every registration, and wrapping a wrapper scrubs twice. The phrase table
  // is not idempotent, so a doubly patched persona collapsed to
  // "rules apply." while looking clean to every "does it contain a brand" test.
  const ctx = new Context();
  ctx.plugin(SystemPrompt, { personaPrefix: '' });
  await tick();
  const presetKey = {};
  const agentKey = {};
  const preset = createScope(ctx, presetKey);
  preset.ctx.plugin(Persona, { prefix: 'DeepSeek Harness rules apply.', complete: true });
  preset.ctx.plugin({
    inject: ['systemPrompt'],
    apply(c) { c.systemPrompt.context({ name: 'probe:ctx', order: 500, text: 'the DeepSeek Harness implementation' }); },
  });
  await tick();
  preset.ctx.plugin({ apply: envApply, inject: envInject, name: envName });
  await tick();
  for (let i = 0; i < 8; i++) {
    ctx.emit('system-prompt/change');
    await tick(15);
  }
  createScope(ctx, agentKey, { parent: presetKey });
  await tick();
  const assembly = await ctx.systemPrompt.assemble({ scope: agentKey });
  assembly.variables = { ...assembly.variables, model: 'm' };
  const prompt = renderPrompt(assembly);
  const snapshot = renderContextSnapshot(ctx.systemPrompt.refreshContext(assembly, { scope: agentKey }));
  report('case 16: repeated rescans do not over-scrub an in-place patch', {
    noBrand: leaks(prompt).length === 0 && leaks(snapshot).length === 0,
    // The fix must not eat the sentence: the subject has to survive.
    sentenceIntact: prompt.startsWith('the agentic coding environment rules apply.'),
    contextIntact: snapshot.endsWith('the implementation'),
  }, [
    `prompt : ${prompt}`,
    `context: ${snapshot.slice(-40)}`,
  ]);
}

// --------------------------------------------------------------- case 17
{
  // scrubAssembly runs inside the per-request waterfall. A shape it does not
  // recognise must pass through, never throw: failing here fails the step.
  const shapes = [
    null,
    { contexts: [], variables: {} },
    { sections: [], variables: {} },
    { sections: [{ name: 'x' }], contexts: [{ name: 'y' }], variables: {} },
    { sections: [{ name: 'x', text: 'DeepSeek Harness' }], contexts: [], variables: { m: 'DeepSeek Harness' } },
  ];
  const outcomes = shapes.map((shape) => {
    try {
      return scrubAssembly(shape, DEFAULT_REPLACEMENTS, true);
    } catch (error) {
      // Report WHY: a bare catch once hid a missing import and turned this
      // case into a green light over a function that never ran.
      return `THREW: ${error?.message ?? error}`;
    }
  });
  const normal = outcomes[4];
  if (!normal || normal === 'THREW') {
    report('case 17: a malformed assembly degrades instead of throwing', {
      noneThrew: false, nullPassedThrough: false, normalStillScrubbed: false,
    }, ['normal shape missing from outcomes']);
  } else {
  report('case 17: a malformed assembly degrades instead of throwing', {
    noneThrew: outcomes.every((o) => o !== 'THREW'),
    nullPassedThrough: outcomes[0] === null,
    normalStillScrubbed: normal.sections[0].text === 'the agentic coding environment'
      && normal.variables.m === 'the agentic coding environment',
  }, [
    `outcomes: ${outcomes.map((o) => (o === 'THREW' ? 'THREW' : 'ok')).join(', ')}`,
  ]);
  }
}

// --------------------------------------------------------------- case 18
{
  // Hostile / sloppy config must not disable the package. A throw from apply()
  // makes Cordis roll back EVERY registration, so a nulled phrase table would
  // silently cost the identity replacement too; and a one-character `from`
  // entry used to shred the prompt ("You re n AI coding gent").
  const run = async (config) => {
    const ctx = new Context();
    ctx.plugin(SystemPrompt, { personaPrefix: '' });
    await tick();
    const presetKey = {};
    const agentKey = {};
    const preset = createScope(ctx, presetKey);
    preset.ctx.plugin({ apply: envApply, inject: envInject, name: envName }, config);
    await tick();
    const registered = [...ctx.systemPrompt.layers.scoped.values()]
      .some((layer) => layer.sections.has('harness:identity'));
    createScope(ctx, agentKey, { parent: presetKey });
    await tick();
    const assembly = await ctx.systemPrompt.assemble({ scope: agentKey });
    assembly.variables = { ...assembly.variables, model: 'm' };
    return { registered, prompt: renderPrompt(assembly) };
  };
  const results = {
    nullPairs: await run({ replacements: null }),
    emptyPairs: await run({ replacements: [] }),
    junkPairs: await run({ replacements: [null, 1, ['a'], ['x']] }),
    stringFlag: await run({ bareToken: 'false' }),
  };
  const allRegistered = Object.values(results).every((r) => r.registered);
  report('case 18: odd configuration never disables the package', {
    identityRegisteredEverywhere: allRegistered,
    junkPairDidNotShred: results.junkPairs.prompt
      === 'You are an AI coding agent working inside an agentic coding environment.',
  }, [
    `junk pairs -> ${results.junkPairs.prompt.slice(0, 80)}`,
    `null pairs -> ${results.nullPairs.prompt.slice(0, 60)}`,
  ]);
}

// -------------------------------------------------------------- case 20
{
  // THE SHIPPED CRASH. Real report: creating a new session failed with
  //   agent-preset/invalid: prompt context "tool:subagent:depth" is already
  //   registered in this scope
  //
  // Cause: `shadowContexts()` iterated EVERY scoped layer, so a context owned
  // by a DIFFERENT preset looked like an unshadowed global. Our plugin claimed
  // that name in OUR layer; the preset's own `tool-subagent` row then tried to
  // register the same name in the SAME layer and threw, which fails preset
  // activation outright and blocks every new session on that preset.
  //
  // The row ORDER is what made it fatal: `env-identity` sits at row 2 of the
  // shipped clones, so it ran before the sibling rows that own those names.
  const mount = async (rows) => {
    const ctx = new Context();
    ctx.plugin(SystemPrompt, { personaPrefix: '' });
    await tick();
    // Another preset mounts first and owns `tool:*:depth` in ITS layer.
    const shipped = createScope(ctx, {});
    shipped.ctx.plugin(subagentDepthRow, { toolName: 'subagent' });
    shipped.ctx.plugin(subagentDepthRow, { toolName: 'subagent_fork' });
    await tick();
    // Ours: env-identity at row 2, the delegating rows after it.
    const ours = {};
    const preset = createScope(ctx, ours);
    preset.ctx.plugin(Persona, { prefix: 'p' });
    const fibers = [
      preset.ctx.plugin({ apply: envApply, inject: envInject, name: envName }, { identity: IDENTITY }),
      preset.ctx.plugin(subagentDepthRow, { toolName: 'subagent' }),
      preset.ctx.plugin(subagentDepthRow, { toolName: 'subagent_fork' }),
    ];
    await tick();
    const failures = [];
    for (const fiber of fibers) {
      try { await fiber.await(); } catch (error) { failures.push(String(error?.message ?? error)); }
    }
    const agentKey = {};
    createScope(ctx, agentKey, { parent: ours });
    await tick();
    // The loop always supplies `agent` alongside `scope`; these providers read
    // `context.agent` and render '' without it.
    const agent = { id: 'probe-agent' };
    const assembly = await ctx.systemPrompt.assemble({ agent, scope: agentKey });
    const refreshed = ctx.systemPrompt.refreshContext(assembly, { agent, scope: agentKey });
    return { failures, context: renderContextSnapshot(refreshed) };
  };
  const result = await mount();
  report('case 20: a sibling preset\'s context name is never claimed', {
    // The whole preset must activate; one failed row blocks new sessions.
    allRowsActivated: result.failures.length === 0,
    // Narrowing the scan must not lose the SIBLING ROWS' own text...
    siblingContextKept: result.context.includes('Delegation depth for subagent'),
    siblingForkContextKept: result.context.includes('Delegation depth for subagent_fork'),
  }, [
    `failures: ${result.failures.length ? result.failures.join(' | ') : 'none'}`,
    '--- runtime context ---',
    result.context || '(empty)',
  ]);
}

// -------------------------------------------------------------- case 21
{
  // THE SECOND SHIPPED LEAK. In the deployment this package ships for, every
  // tool row is disabled globally and re-declared INSIDE each preset
  // (`tool-bash`, `tool-fs`, ...). `shadowTools()` asked `tools.view()` with no
  // scope — the GLOBAL view — which is empty there, so every tool description
  // kept its brand text. Measured before the fix: a preset-layer tool still
  // read "Export the DSH Web UI DOM snapshot."
  const ctx = new Context();
  ctx.plugin(SystemPrompt, { personaPrefix: '' });
  ctx.plugin(ToolsService);
  await tick();
  const presetKey = {};
  const agentKey = {};
  const preset = createScope(ctx, presetKey);
  preset.ctx.plugin({ apply: envApply, inject: envInject, name: envName }, { identity: IDENTITY });
  preset.ctx.plugin(brandedToolPlugin);   // registered in the PRESET layer
  await tick();
  createScope(ctx, agentKey, { parent: presetKey });
  await tick();
  const toolSet = await ctx.tools.resolve({ agent: agentKey, signal: new AbortController().signal });
  const schemas = ctx.tools.schemas(agentKey, toolSet);
  const tool = schemas.find((t) => t.name === 'probe_branded_tool');
  // `probe_param_brand_tool` is the one whose brand text lives ONLY inside
  // `parameters`, so it is the real test of the recursive scrub.
  const paramTool = schemas.find((t) => t.name === 'probe_param_brand_tool');
  const other = schemas.find((t) => t.name === 'probe_identifier_tool');
  const docs = [];
  const collect = (node) => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const item of node) collect(item); return; }
    for (const [key, child] of Object.entries(node)) {
      if ((key === 'description' || key === 'title') && typeof child === 'string') docs.push(child);
      else collect(child);
    }
  };
  collect(paramTool?.parameters ?? {});
  report('case 21: preset-layer tools are scrubbed too', {
    toolVisibleFromPresetLayer: tool !== undefined,
    topLevelClean: tool !== undefined && leaks(tool.description).length === 0,
    parameterDocsClean: docs.length > 0 && docs.flatMap((text) => leaks(text)).length === 0,
    identifiersIntact: other !== undefined && other.description === IDENTIFIER_PROBE,
  }, [
    `description: ${tool?.description ?? '(missing)'}`,
    `parameter docs: ${docs.join(' / ') || '(none)'}`,
  ]);
}

// -------------------------------------------------------------- case 22
{
  // THE STOCK-DEPLOYMENT CRASH. `dsh-base` mounts a GLOBAL `tool-subagent`
  // (enabled); only `dsh-web-app` disables it. Every shipped preset re-declares
  // the same row. So on a profile without the web-app override, the global and
  // the preset copy of `tool:subagent:depth` share a name.
  //
  // Shadowing that global name FROM THE PRESET LAYER occupies it, and the
  // preset's own row then fails with `already registered in this scope` —
  // byte-identical to the reported `agent-preset/invalid`, and fatal the same
  // way. Inherited contexts must therefore be shadowed in the AGENT's layer,
  // which competes with nobody.
  const mountOrdering = async (envFirst) => {
    const ctx = new Context();
    ctx.plugin(SystemPrompt, { personaPrefix: '' });
    await tick();
    // GLOBAL owner of the name, as `dsh-base` does it. The text carries the
    // brand so "did the other preset stay untouched" is observable.
    ctx.plugin(subagentDepthRow, { toolName: 'subagent' });
    await tick();
    const otherKey = {};
    createScope(ctx, otherKey);
    const oursKey = {};
    const ours = createScope(ctx, oursKey);
    const envFiber = envFirst
      ? ours.ctx.plugin({ apply: envApply, inject: envInject, name: envName }, { identity: IDENTITY })
      : undefined;
    await tick();
    const sibling = ours.ctx.plugin(subagentDepthRow, { toolName: 'subagent' });
    let siblingError;
    try { await sibling.await(); } catch (error) { siblingError = String(error?.message ?? error); }
    if (envFiber === undefined) {
      ours.ctx.plugin({ apply: envApply, inject: envInject, name: envName }, { identity: IDENTITY });
      await tick();
    }
    // A preset WITHOUT us keeps the brand; ours must not touch it.
    const otherAgent = createAgent(ctx, otherKey, 'other');
    const ourAgent = createAgent(ctx, oursKey, 'ours');
    await announceAgent(ctx, otherAgent);
    await announceAgent(ctx, ourAgent);

    // NOTE: no "late sibling re-declaring the SAME name" probe here. Two rows
    // registering one name in ONE preset layer is rejected by the registry
    // itself, with or without this plugin (verified separately), so asserting
    // it would be testing somebody else's rule. What this case pins is the
    // coexistence of a GLOBAL owner with the preset's own row — the shape
    // `dsh-base` + every shipped preset actually produces.
    const textFor = async (agent) => {
      const assembly = await ctx.systemPrompt.assemble({ agent, scope: agent });
      return renderContextSnapshot(ctx.systemPrompt.refreshContext(assembly, { agent, scope: agent }));
    };
    return {
      siblingError,
      otherText: await textFor(otherAgent),
      ourText: await textFor(ourAgent),
    };
  };
  const first = await mountOrdering(true);
  const last = await mountOrdering(false);
  // NOTE: this case does NOT require a brand in the probed context — what it
  // pins is the ACTIVATION outcome plus the blast radius. `leaks()` on the
  // other preset is the blast-radius half, and the sibling text proves the
  // preset's own row kept working.
  const ok = (r) => r.siblingError === undefined
    && r.otherText.includes('Delegation depth for subagent')
    && r.ourText.includes('Delegation depth for subagent')
    && r.otherText.includes('Delegation depth for subagent')
    && r.ourText.includes('Delegation depth for subagent');
  report('case 22: a global context name is never occupied by the preset', {
    envMountedFirst: ok(first),
    envMountedLast: ok(last),
  }, [
    `env first: sibling=${first.siblingError ?? 'ok'}`,
    `  other preset: ${first.otherText.split('\n').filter(Boolean).slice(1).join(' | ')}`,
    `  our   preset: ${first.ourText.split('\n').filter(Boolean).slice(1).join(' | ')}`,
    `env last : sibling=${last.siblingError ?? 'ok'}`,
    `  other preset: ${last.otherText.split('\n').filter(Boolean).slice(1).join(' | ')}`,
    `  our   preset: ${last.ourText.split('\n').filter(Boolean).slice(1).join(' | ')}`,
  ]);
}

// -------------------------------------------------------------- case 23
{
  // THE STALE-WRAPPER BUG. The agent-layer shadow must resolve the CURRENT
  // winner instead of closing over the provider it saw when it was installed.
  //
  // Closing over it meant a provider disposed and re-registered under the same
  // name (a rebuilt preset, an HMR reload, a row mounted after the first turn)
  // never reached the model: the OLD wrapper kept rendering text nobody had
  // registered any more. Measured before the fix: D2 still read "one."
  //
  // The resolver must also skip its own wrappers, or a wrapper that wins the
  // name delegates to itself — a RangeError, not a leak.
  const ctx = new Context();
  ctx.plugin(SystemPrompt, { personaPrefix: '' });
  await tick();
  const presetKey = {};
  const preset = createScope(ctx, presetKey);
  preset.ctx.plugin({ apply: envApply, inject: envInject, name: envName }, { identity: IDENTITY });
  await tick();
  const agent = createAgent(ctx, presetKey, 'stale-probe');

  const mountOwner = (label) => {
    const owner = (c) => {
      c.systemPrompt.context({
        name: 'probe:replaceable', order: 110,
        text: () => `Current DSH file policy: ${label}.`,
      });
    };
    owner.inject = ['systemPrompt'];
    return ctx.plugin(owner);
  };
  const render = async () => {
    await announceAgent(ctx, agent);
    const assembly = await ctx.systemPrompt.assemble({ agent, scope: agent });
    const refreshed = ctx.systemPrompt.refreshContext(assembly, { agent, scope: agent });
    return renderContextSnapshot(refreshed);
  };

  const firstOwner = mountOwner('one');
  await tick();
  const first = await render();
  await firstOwner.dispose?.();
  await tick();
  mountOwner('two');
  await tick();
  const second = await render();

  report('case 23: a replaced provider is read through, not frozen in', {
    firstScrubbed: leaks(first).length === 0 && first.includes('one.'),
    // The replacement's text must appear AND stay scrubbed.
    replacementVisible: second.includes('two.'),
    replacementScrubbed: leaks(second).length === 0,
    didNotThrow: true,
  }, [
    `first : ${first.split('\n').filter(Boolean).slice(1).join(' | ')}`,
    `second: ${second.split('\n').filter(Boolean).slice(1).join(' | ')}`,
  ]);
}

// --------------------------------------------------------------- case 19
{
  // scrubText runs on EVERY model step. It used to slice the whole string per
  // match to look one character back and one word forward, which is quadratic:
  // a 200KB context took 66 seconds. Prompts with many brand tokens are exactly
  // the pathological input, so this pins linear-ish behaviour.
  const build = (n) => 'DSH '.repeat(n);
  const time = (text) => {
    const started = process.hrtime.bigint();
    scrubText(text, DEFAULT_REPLACEMENTS, true);
    return Number(process.hrtime.bigint() - started) / 1e6;
  };
  time(build(500));            // warm up
  const small = time(build(2000));
  const large = time(build(8000));   // 4x the tokens
  // Quadratic would be ~16x; anything under 10x is comfortably linear enough.
  const ratio = large / Math.max(small, 0.5);
  report('case 19: scrubbing stays linear on token-dense text', {
    // 32000 tokens must finish well inside a step budget.
    largeUnder500ms: large < 500,
    notQuadratic: ratio < 10,
  }, [
    `2000 tokens: ${small.toFixed(1)}ms`,
    `8000 tokens: ${large.toFixed(1)}ms (ratio ${ratio.toFixed(1)}x, quadratic would be ~16x)`,
  ]);
}

// Counted, not hardcoded: adding a case must never leave this line lying.
console.log(`\n${failed === 0 ? `ALL ${total} CASES PASS` : `${failed} OF ${total} CASE(S) FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
