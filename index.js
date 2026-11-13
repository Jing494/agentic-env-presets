/**
 * Preset-scoped prompt rewriter: makes one agent preset's system prompt describe
 * a plain *agentic coding environment* instead of naming the harness.
 *
 * This module is a plain Cordis function plugin. It is mounted as a row inside
 * an `@deepseek-ai/dsh-agent-preset` composition, so every registration below
 * lands in that preset's standing scope. `dsh-system-prompt` keys its scoped
 * layers by section/context name (`ScopedLayers.merge`), and the agent scope is
 * chained to its preset's scope (`bindScopeParent(agentKey, presetKey)`), so a
 * same-named registration here SHADOWS the global one for the agents that join
 * this preset — and only for them. Other presets and the deployment layer keep
 * their original prompt text.
 *
 * Three layers, in the priority order the task asks for:
 *
 * 1. REPLACE the identity. `harness:identity` (order -1000) is registered
 *    globally by `@deepseek-ai/dsh-system-prompt` as
 *    "You are an AI agent powered by DeepSeek Harness." and guarded by the
 *    deployment-level `includeHarnessIdentity` switch, which no preset can
 *    flip. Re-registering the same section name in the preset scope replaces
 *    the text outright.
 *
 * 2. SILENCE harness-maintenance context. `@deepseek-ai/dsh-harness-dev-context`
 *    registers `harness:source` and `app:web-surface` — each as both a prompt
 *    section (order 10000 / 10100) and a runtime-context entry (200 / 210) —
 *    which name the harness checkout and Web GUI URL. They help only an agent
 *    that maintains the harness itself. Re-registering those four names with
 *    empty text shadows them away: `renderPrompt` drops empty sections and
 *    empty contexts vanish from the joined snapshot, while the global owner
 *    stays mounted for other presets.
 *
 * 3. SCRUB leftover brand tokens. A few framework texts (e.g.
 *    `dsh-sandbox-policy`'s "Current DSH file policy: ...") mention the brand
 *    in passing. A scope-filtered `system-prompt/assemble` waterfall listener
 *    applies literal `[from, to]` phrase replacement to every assembled
 *    section and context, so nothing survives that layers 1 and 2 did not own.
 *    Literal `split/join`, never regex — `$DSH_HOME`, `DSH_ENV_PREFIX`, socket
 *    paths, and the `dsh` CLI name all share substrings with the brand token.
 *    The pair list is `config.replacements`, so a deployment with different
 *    wording can adjust it without a code change.
 *
 * The listener returns COPIES of the section/context entries. Until the
 * waterfall returns, an assembly shares object references with the registry;
 * mutating entries in place would leak into other agents' later requests.
 *
 * Deliberately NOT done: no global patch to framework prompt strings, no
 * `complete: true` takeover (that would swallow tool guidance, plan mode, and
 * the SDK docs and break prompt caching), no regex replacement.
 *
 * @module @local/agentic-env-presets
 */

/** Section slot owned by `@deepseek-ai/dsh-system-prompt` (`SECTION_ORDERS.HARNESS_IDENTITY`). */
const IDENTITY_SECTION = 'harness:identity';
/** Fallback order, used only if the owning registry reports no such slot. */
const IDENTITY_ORDER = -1000;

/**
 * Section/context names registered by `@deepseek-ai/dsh-harness-dev-context`.
 * `getSectionOrder` / `getContextOrder` are queried at mount time; the
 * fallbacks match SECTION_ORDERS / CONTEXT_ORDERS in this DSH release.
 */
const DEV_CONTEXT_ROWS = [
  { name: 'harness:source', slot: 'HARNESS_SOURCE', sectionFallback: 10000, contextFallback: 200 },
  { name: 'app:web-surface', slot: 'WEB_SURFACE', sectionFallback: 10100, contextFallback: 210 },
];

/**
 * Default brand phrases to neutralize, as literal [from, to] pairs.
 *
 * Order matters: each pair is applied in sequence. The space-suffixed
 * "DeepSeek Harness " variant runs FIRST, so a mid-sentence mention disappears
 * cleanly ("the DeepSeek Harness implementation checkout" becomes "the
 * implementation checkout") instead of leaving a doubled word; the bare
 * variant then catches sentence-final mentions. The sandbox-policy pairs turn
 * "Current DSH file policy" into "Current file policy".
 *
 * Each pair is a whole literal PHRASE, never a bare token: "DSH" also occurs
 * in operational identifiers the model must keep seeing — `$DSH_HOME`,
 * `DSH_ENV_PREFIX`, the `dsh` CLI name in "only dsh web injects
 * window.__DSH_BOOT__", and socket paths. A bare "DSH" replacement would
 * corrupt all of them. "extend DSH itself" is the one uppercase "DSH" used as
 * a self-reference rather than an identifier, so it gets its own literal pair.
 *
 * These are config defaults, not hardcoded behavior: overriding
 * `config.replacements` in the preset row replaces this list wholesale.
 */
const DEFAULT_REPLACEMENTS = [
  ['DeepSeek Harness ', ''],
  ['DeepSeek Harness', 'the agentic coding environment'],
  ['DSH file policy', 'file policy'],
  ['DSH file sandbox', 'file sandbox'],
  ['extend DSH itself', 'extend the environment itself'],
];

/**
 * Replace configured phrases throughout one assembled prompt.
 *
 * Operates on copies: an assembly's section/context entries are shared with
 * the registry until this listener returns, so editing them in place would
 * leak into later assemblies of other agents.
 *
 * @param {object} assembly - the assembly returned by the rest of the waterfall.
 * @param {Array<[string, string]>} replacements - literal [from, to] pairs;
 *   an empty `from` is ignored (split('') would explode the string).
 * @returns {object} a new assembly whose texts have the replacements applied.
 */
function scrub(assembly, replacements) {
  const pairs = replacements.filter(
    (pair) => Array.isArray(pair) && typeof pair[0] === 'string' && pair[0].length > 0,
  );
  if (pairs.length === 0) return assembly;
  const rewrite = (text) => {
    let result = typeof text === 'string' ? text : String(text ?? '');
    for (const [from, to] of pairs) result = result.split(from).join(to ?? '');
    return result;
  };
  return {
    ...assembly,
    sections: assembly.sections.map((section) => ({ ...section, text: rewrite(section.text) })),
    contexts: assembly.contexts.map((entry) => ({ ...entry, text: rewrite(entry.text) })),
  };
}

/**
 * Register the identity replacement, the harness-context shadows, and the
 * phrase scrub for the mounting preset's scope.
 *
 * @param {object} ctx - the preset-scope context (a global context would
 *   collide with the owners of `harness:identity` / `harness:source`).
 * @param {object} config - `{ identity, silenceDevContext, replacements }`.
 */
function apply(ctx, config = {}) {
  const {
    identity = 'You are an AI coding agent working inside an agentic coding environment.',
    silenceDevContext = true,
    replacements = DEFAULT_REPLACEMENTS,
  } = config;

  if (typeof identity !== 'string' || identity.trim().length === 0) {
    throw new Error('env-identity: config.identity must be a non-empty string');
  }
  if (!Array.isArray(replacements)) {
    throw new Error('env-identity: config.replacements must be an array of [from, to] pairs');
  }

  ctx.effect(() => ctx.systemPrompt.section({
    name: IDENTITY_SECTION,
    order: ctx.systemPrompt.getSectionOrder('HARNESS_IDENTITY') ?? IDENTITY_ORDER,
    text: identity,
    interpolate: false,
  }), 'env-identity.section()');

  if (silenceDevContext) {
    for (const row of DEV_CONTEXT_ROWS) {
      ctx.effect(() => ctx.systemPrompt.section({
        name: row.name,
        order: ctx.systemPrompt.getSectionOrder(row.slot) ?? row.sectionFallback,
        text: '',
        interpolate: false,
      }), 'env-identity.dev-section()');
      ctx.effect(() => ctx.systemPrompt.context({
        name: row.name,
        order: ctx.systemPrompt.getContextOrder(row.slot) ?? row.contextFallback,
        text: '',
        interpolate: false,
      }), 'env-identity.dev-context()');
    }
  }

  // Scope-filtered: `system-prompt/assemble` is dispatched through
  // `scopeTarget(this, scope)`, and a listener owned by an ancestor scope is
  // admitted for every descendant key. Baseline presets have no such listener.
  const onAssemble = async (_assembly, _context, next) => scrub(await next(), replacements);
  ctx.effect(() => ctx.on('system-prompt/assemble', onAssemble), 'env-identity.scrub()');
}

const name = 'env-identity';
const inject = ['systemPrompt'];

export { DEFAULT_REPLACEMENTS, apply, inject, name };
