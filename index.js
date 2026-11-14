/**
 * Preset-scoped prompt rewriter: makes one agent preset's model-facing text
 * describe a plain *agentic coding environment* instead of naming the harness.
 *
 * This module is a plain Cordis function plugin. It is mounted as a row inside
 * an `@deepseek-ai/dsh-agent-preset` composition, so every registration below
 * lands in that preset's standing scope. `dsh-system-prompt` keys its scoped
 * layers by section/context name (`ScopedLayers.merge`), and the agent scope is
 * chained to its preset's scope (`bindScopeParent(agentKey, presetKey)`), so a
 * same-named registration here SHADOWS the global one for the agents that join
 * this preset — and only for them. Other presets and the deployment layer keep
 * their original text.
 *
 * There are FIVE surfaces the model can read brand prose from, and they are
 * owned by four different subsystems, so no single seam covers them all:
 *
 *   1. SYSTEM PROMPT SECTIONS (`systemPrompt.section`). The identity sentence
 *      plus the harness-maintenance paragraphs. Same-name re-registration here
 *      replaces them outright.
 *
 *   2. RUNTIME CONTEXT (`systemPrompt.context`). The `sandbox:policy` text
 *      ("Current DSH file policy: …") is a *live provider function*, and the
 *      agent loop re-resolves every provider through
 *      `SystemPrompt.refreshContext()` AFTER the assembly waterfall returns.
 *      A waterfall-only scrub therefore looks correct in a unit test and leaks
 *      in the real request. The fix is to shadow each global context with a
 *      delegating wrapper, so refresh resolves OUR function.
 *
 *   3. TOOL SCHEMAS (description + parameter descriptions). Owned by
 *      `@deepseek-ai/dsh-tools`, projected straight from the registry; the
 *      prompt waterfall never sees them. In PTC mode the same descriptions are
 *      inlined into the `tools:sdk` prompt section, so this one fix covers both
 *      executors. Same-name re-registration with the text swapped and the
 *      executable callbacks forwarded is the only seam that works.
 *
 *   4. LOOP-INJECTED USER MESSAGES (`agent/pre-step`). The skill catalog is a
 *      durable user message built by `@deepseek-ai/dsh-tool-skill` AFTER its
 *      own `next()`. Our listener must therefore be OUTERMOST
 *      (`{ prepend: true }`): an inner listener runs before the catalog exists
 *      and silently does nothing.
 *
 *   5. THE REMAINDER. Anything the four layers above did not own still passes
 *      through the `system-prompt/assemble` waterfall, which is kept as a
 *      last-resort scrub.
 *
 * ORDERING IS LOAD-BEARING. `agent/pre-step` listeners run outermost-first and
 * `dsh-tool-skill` appends after awaiting `next()`. Registering our catalog
 * scrub without `prepend` produces a build that passes a naive test and leaks
 * in production; `verify.mjs` pins this with an explicit ordering case.
 *
 * Deliberately NOT done: no global rewrite of framework strings, no
 * `complete: true` takeover (that would swallow tool guidance, plan mode, and
 * the SDK docs and break prompt caching), no mutation of registered objects.
 *
 * @module dsh-agentic-env-presets
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

/** The neutral noun substituted for a bare brand mention. */
const NEUTRAL = 'the agentic coding environment';

/**
 * Default brand phrases to neutralize, as literal [from, to] pairs.
 *
 * Order matters — each pair is applied in sequence, longest/most specific
 * first. The Chinese parenthetical form `DSH（DeepSeek Harness）` is matched
 * before either half alone, so a sentence like "运行在 DSH（DeepSeek Harness）
 * 里" collapses to one neutral phrase instead of two overlapping ones.
 *
 * Every entry is a whole literal PHRASE, never a bare token: `DSH` also occurs
 * in operational identifiers the model must keep seeing — `$DSH_HOME`,
 * `DSH_ENV_PREFIX`, `window.__DSH_BOOT__`, `engines.dsh`, `DSH-1234`, the
 * `dsh` CLI name and `@deepseek-ai/dsh-*` package names. Those are handled by
 * the guarded bare-token rule at the end, which excludes identifier contexts.
 */
const DEFAULT_REPLACEMENTS = [
  ['DSH（DeepSeek Harness）', NEUTRAL],
  ['DSH (DeepSeek Harness)', NEUTRAL],
  // The brand used as an ADJECTIVE ("the DeepSeek Harness implementation
  // checkout") reads as a doubled article if it becomes "the the agentic
  // coding environment …", so it collapses to nothing — but only when what
  // follows is a word, never before punctuation or at the end of a sentence,
  // which used to produce "Powered by and more." and a bare "context".
  // Deleting the space-suffixed form is only safe when a noun clearly follows
  // ("the DeepSeek Harness implementation checkout" -> "the implementation
  // checkout"). It cannot be told apart from the brand being the SUBJECT
  // ("DeepSeek Harness rules apply"), which used to collapse to the bare
  // "rules apply." — so the deletion is restricted to the one shape it was
  // written for: a definite article before the brand, and never a word that
  // can be a verb or a sentence head.
  ['DeepSeek Harness ', (after, before) => {
    const adjectiveSlot = /\b(the|a|an|this|that|these|those|its|their|our|your|my|his|her)\s+$/i.test(before);
    if (!adjectiveSlot) return undefined;
    const word = /^([A-Za-z][\w-]*)/.exec(after);
    if (word === null) return undefined;
    const NOT_A_NOUN = new Set([
      'and', 'or', 'but', 'nor', 'so', 'yet', 'then', 'than', 'as', 'if',
      'is', 'was', 'are', 'were', 'be', 'been', 'being', 'has', 'have', 'had',
      'does', 'do', 'did', 'can', 'could', 'will', 'would', 'shall', 'should',
      'may', 'might', 'must', 'rules', 'matters', 'applies', 'applied',
      'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'into',
    ]);
    return NOT_A_NOUN.has(word[1].toLowerCase()) ? undefined : '';
  }],
  ['DeepSeek Harness', NEUTRAL],
  ['DSH Marketplace', 'plugin marketplace'],
  ['the DSH ecosystem', 'the plugin ecosystem'],
  ['DSH ecosystem', 'plugin ecosystem'],
  ['DSH file policy', 'file policy'],
  ['DSH file sandbox', 'file sandbox'],
  ['DSH version requirements', 'version requirements'],
  ['DSH peer dependencies', 'peer dependencies'],
  ['DSH image references', 'image references'],
  ['DSH 自有', '自有'],
  ['DSH 自己', '自己'],
  ['DSH 可', '环境可'],
  ['extend DSH itself', 'extend the environment itself'],
  // Lowercase prose OUTSIDE the "DeepSeek Harness" phrase. The `bash` tool
  // tells the model that `$DSH_*` variables "expose current harness environment
  // facts" — a real session read that as "the DSH environment" and introduced
  // itself that way. The identifier `$DSH_*` in the same sentence is preserved
  // by the guarded rule.
  ['current harness environment facts', 'current environment facts'],
  ['harness environment facts', 'environment facts'],
];

/**
 * Guarded bare-token rule for residual prose mentions.
 *
 * A literal table can never enumerate every sentence a plugin author writes,
 * so a bare `DSH` that survived the phrase table is replaced here. The
 * lookarounds keep every identifier intact: `$DSH_HOME`, `DSH_ENV_PREFIX`,
 * `__DSH_BOOT__`, `engines.dsh`, `@deepseek-ai/dsh-tool-bash`, `DSH-1234` and
 * `myDSHThing` all fail one of the three assertions and are left alone.
 *
 * This regex is deliberately narrow (one token, fixed lookarounds, no
 * backtracking risk) rather than a general "replace the brand" expression.
 */
const BARE_BRAND = /(?<![\w$.\-])DSH(?![\w\-])/g;

/** Collapse the "the the" artefacts a space-suffix removal can leave behind. */
const DOUBLED_ARTICLE = /\b([Tt]he) \1\b/g;

/** A sentence boundary: start of text, or the punctuation/newline before a word. */
const SENTENCE_START = /(^|[.!?:]\s+|\n\s*)$/;

/** CJK text: an English article at the head of a Chinese sentence reads wrong. */
const CJK = /[\u3000-\u9fff\uff00-\uffef]/;

/**
 * Replace configured phrases throughout one string.
 *
 * @param {string} text - the text to rewrite.
 * @param {Array<[string, string]>} replacements - literal [from, to] pairs;
 *   an empty `from` is ignored (split('') would explode the string).
 * @param {boolean} bareToken - whether the guarded bare-token rule also runs.
 * @returns {string} the rewritten text.
 */
function scrubText(text, replacements, bareToken) {
  let out = typeof text === 'string' ? text : String(text ?? '');
  if (out.length === 0) return out;
  for (const pair of replacements) {
    if (!Array.isArray(pair) || typeof pair[0] !== 'string' || pair[0].length === 0) continue;
    const [, to] = pair;
    if (typeof to === 'function') {
      // Conditional replacement: `to` inspects the text that FOLLOWS the match
      // and decides whether to delete it (''), keep a neutral noun, or leave
      // the phrase untouched (undefined).
      let at = out.indexOf(pair[0]);
      if (at < 0) continue;
      let result = '';
      let last = 0;
      while (at >= 0) {
        const after = out.slice(at + pair[0].length);
        const decision = to(after, out.slice(0, at));
        result += out.slice(last, at) + (decision === undefined ? pair[0] : decision);
        last = at + pair[0].length;
        at = out.indexOf(pair[0], last);
      }
      out = result + out.slice(last);
      continue;
    }
    out = out.split(pair[0]).join(to ?? '');
  }
  if (bareToken) {
    // Capitalise when the token began a sentence: a bare `DSH rules apply`
    // becomes "The … rules apply", not "the … rules apply". Skipped when the
    // surrounding text is CJK — an English article at the head of a Chinese
    // sentence reads worse than the lowercase form.
    out = out.replace(BARE_BRAND, (match, offset, whole) => {
      const atSentenceStart = SENTENCE_START.test(whole.slice(0, offset));
      // Look past whitespace on both sides: "DSH 的规则" and "规则 DSH" are CJK
      // contexts even though the immediate neighbour is a space.
      const after = whole.slice(offset + match.length).replace(/^\s+/, '').charAt(0);
      const before = whole.slice(0, offset).replace(/\s+$/, '').slice(-1);
      const cjkNeighbour = CJK.test(after) || CJK.test(before);
      return atSentenceStart && !cjkNeighbour
        ? NEUTRAL[0].toUpperCase() + NEUTRAL.slice(1)
        : NEUTRAL;
    });
  }
  return out.replace(DOUBLED_ARTICLE, '$1');
}

/** Normalize and validate the configured phrase table. */
function normalizeReplacements(replacements) {
  if (!Array.isArray(replacements)) {
    throw new Error('env-identity: config.replacements must be an array of [from, to] pairs');
  }
  return replacements.filter(
    (pair) => Array.isArray(pair)
      && typeof pair[0] === 'string'
      && pair[0].length > 0
      && (typeof pair[1] === 'string' || typeof pair[1] === 'function' || pair[1] === undefined),
  );
}

/**
 * Rewrite one assembled prompt, copying every entry.
 *
 * Operates on copies: an assembly's section/context entries are shared with
 * the registry until this listener returns, so editing them in place would
 * leak into later assemblies of other agents.
 */
function scrubAssembly(assembly, replacements, bareToken) {
  const rewrite = (text) => scrubText(text, replacements, bareToken);
  // This runs on EVERY model step, inside the assembly waterfall. Throwing here
  // would fail the whole request, so a shape this plugin does not recognise is
  // passed through untouched rather than taken down. (A newer or older harness
  // may add or drop fields; the scrub is cosmetic, the request is not.)
  if (assembly === null || typeof assembly !== 'object') return assembly;
  // `variables` is the third thing an assembly carries, and `renderPrompt()`
  // resolves `{{name}}` references from it AFTER this waterfall returns — so a
  // value carrying a brand used to land in the prompt verbatim even though
  // every section around it was clean. Only strings are rewritten; a provider
  // may legitimately return a non-string.
  const variables = assembly.variables === undefined || assembly.variables === null
    ? assembly.variables
    : Object.fromEntries(Object.entries(assembly.variables).map(([key, value]) => [
      key,
      typeof value === 'string' ? rewrite(value) : value,
    ]));
  const sections = Array.isArray(assembly.sections)
    ? assembly.sections.map((section) => ({ ...section, text: rewrite(section?.text) }))
    : assembly.sections;
  const contexts = Array.isArray(assembly.contexts)
    ? assembly.contexts.map((entry) => ({ ...entry, text: rewrite(entry?.text) }))
    : assembly.contexts;
  return {
    ...assembly,
    ...variables === assembly.variables ? {} : { variables },
    sections,
    contexts,
  };
}

/**
 * Rewrite one context provider's `text` in place, with the same three guards
 * the `complete: true` path uses.
 *
 * Needed when the provider sits in the very layer this preset registers into:
 * the name is taken, so a shadowing registration throws by design. Both
 * `assemble()` and `refreshContext()` re-read `.text` per request, so replacing
 * that one property is enough — and it is undone on unload.
 *
 * @returns `undefined` on success, or a short reason why it refused.
 */
function patchProviderInPlace(ctx, state, table, name, provider) {
  if (Object.isFrozen(provider)) return 'provider object is frozen';
  // Never touch an object another layer can also resolve.
  try {
    let seen = 0;
    const count = (candidate) => {
      try {
        for (const entry of candidate.contexts.values()) if (entry === provider) seen++;
      } catch { /* unattachable table */ }
    };
    count(ctx.systemPrompt.layers.global);
    if (ctx.systemPrompt.layers.scoped instanceof Map) {
      for (const layer of ctx.systemPrompt.layers.scoped.values()) count(layer);
    }
    if (seen > 1) return 'provider object is shared across layers';
  } catch { /* fall through to the patch */ }
  // Idempotency comes from `state.contexts`, which records the provider OBJECT
  // per name: a rescan sees the same object and skips before reaching here.
  const original = provider.text;
  const wrapped = typeof original === 'function'
    ? (context) => scrubText(original(context), state.replacements, state.bareToken)
    : scrubText(original, state.replacements, state.bareToken);
  try {
    provider.text = wrapped;
  } catch (error) {
    return String(error?.message ?? error);
  }
  ctx.effect(() => () => {
    if (provider.text === wrapped) provider.text = original;
  }, 'env-identity.context-in-place()');
  return undefined;
}

/**
 * Re-register every global runtime context under its own name, delegating to
 * the original provider and scrubbing the result.
 *
 * This is what makes the scrub survive `refreshContext()`, which re-resolves
 * providers after the waterfall and would otherwise restore the original text.
 *
 * The scan is re-run on `system-prompt/change` because providers mount in any
 * order; a context registered after this plugin activates is picked up on the
 * next change notification.
 *
 * TWO failure modes this guards against, both found by mounting the same
 * plugins in a different order:
 *
 *   - `state.contexts` records names this plugin already OWNS in its own scope.
 *     A name registered as an empty shadow by layer 1b (`harness:source`,
 *     `app:web-surface`) must never be re-registered here: the duplicate throws
 *     out of `ctx.effect`, and without per-name containment that one throw
 *     aborts the whole loop, silently leaving every later context unscrubbed.
 *     The symptom is a mount-order-dependent leak, which is why it survived a
 *     single-order test suite.
 *   - Each name is therefore attempted inside its own `try`, so one unusable
 *     provider cannot cost the others their scrub.
 */
function shadowContexts(ctx, state) {
  const prompt = ctx.systemPrompt;
  const tables = [];
  try {
    if (prompt.layers?.global?.contexts !== undefined) tables.push(prompt.layers.global.contexts);
    // Scoped layers too: a preset-scoped provider (a sibling row) is just as
    // reachable by the model, and the merge lets it win over the global one.
    if (prompt.layers?.scoped instanceof Map) {
      for (const layer of prompt.layers.scoped.values()) {
        if (layer.contexts !== undefined) tables.push(layer.contexts);
      }
    }
  } catch {
    return;
  }
  for (const table of tables) {
    let entries;
    try {
      entries = [...table.entries()];
    } catch {
      continue;
    }
    for (const [name, provider] of entries) {
      // The bookkeeping stores the PROVIDER OBJECT that was handled, not just
      // the name. A provider disposed and re-registered under the same name is
      // a different object with different text: skipping by name alone left
      // its brand text unshadowed (measured — a re-registered
      // `probe:ctx` came back "DeepSeek Harness context" verbatim).
      if (state.contexts.get(name) === provider) continue;
      // Layer 1b already owns this name in our scope; re-registering would throw.
      if (state.owned.has(name)) {
        state.contexts.set(name, provider);
        continue;
      }
      const text = provider.text;
      if (typeof text !== 'function' && scrubText(text, state.replacements, state.bareToken) === text) {
        // Nothing to rewrite and no live provider: leave the original in place.
        state.contexts.set(name, provider);
        continue;
      }
      state.contexts.set(name, provider);
      try {
        ctx.effect(() => prompt.context({
          ...provider,
          name,
          text: (context) => scrubText(
            typeof text === 'function' ? text(context) : text,
            state.replacements,
            state.bareToken,
          ),
        }), 'env-identity.shadow-context()');
      } catch (error) {
        const message = String(error?.message ?? error);
        if (!/already registered|duplicate/i.test(message)) {
          state.failed.push(`context:${name}: ${message}`);
          ctx.logger?.warn?.(`env-identity: could not shadow context "${name}": ${message}`);
          continue;
        }
        // The provider lives in the SAME layer we mount into, so a same-name
        // registration can never win. Rewrite the entry instead: `assemble()`
        // and `refreshContext()` both read `resolveContext(provider)` on every
        // request, which reads `.text` fresh. Measured: a same-layer provider
        // re-registered under a name we had already handled came back with its
        // brand text verbatim.
        const problem = patchProviderInPlace(ctx, state, table, name, provider);
        if (problem !== undefined) {
          state.failed.push(`context:${name}: ${problem}`);
          ctx.logger?.warn?.(
            `env-identity: runtime context "${name}" is registered in this preset's own layer `
            + `(${problem}); its text cannot be rewritten here`,
          );
        }
      }
    }
  }
}


/**
 * Rewrite prose inside a JSON-schema tree, copying every level.
 *
 * Only the values of `description` and `title` keys are rewritten: those are
 * documentation. `enum`, `const`, `default`, `format`, property NAMES and
 * `$ref` targets are data or identifiers, and changing them would break the
 * schema — `enum: ["DSH"]` must stay `["DSH"]`, and a property named `DSH_HOME`
 * must keep its name or the produced arguments stop matching.
 *
 * The result is a plain JSON value, which is what `ToolsService.register()`
 * requires (`projectToolSchema` deep-clones it and rejects anything lossy).
 *
 * @param {*} value - any JSON value from a tool schema.
 * @param {(text: string) => string} rewrite - the text rewriter.
 * @returns {*} a copy of `value` with documentation strings rewritten.
 */
function scrubSchemaDocs(value, rewrite) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item) => scrubSchemaDocs(item, rewrite));
  if (value === null || typeof value !== 'object') return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'description' || key === 'title') {
      out[key] = typeof child === 'string' ? rewrite(child) : scrubSchemaDocs(child, rewrite);
      continue;
    }
    out[key] = scrubSchemaDocs(child, rewrite);
  }
  return out;
}

/**
 * Re-register every branded tool under its own name with scrubbed
 * documentation, forwarding the executable callbacks untouched.
 *
 * BOTH places a tool publishes prose are covered:
 *
 *   - `description`, the top-level summary;
 *   - `parameters`, whose nested `description`/`title` fields are appended to
 *     the same schema the model reads. Missing these was a real leak: the
 *     `image_generate` and `plugin_manager` brand mentions live only inside
 *     `parameters`, so a top-level-only scrub reported clean while the real
 *     request still carried the brand.
 *
 * Scoped registrations shadow global ones per `ToolsService.view()`, and a
 * shadowed definition still obeys a descendant scope's `tools.restrict()`, so
 * subagent tool filters keep working. `run_code` is reserved by the PTC
 * transport and is never registered here.
 */
function shadowTools(ctx, state) {
  // `ctx.get()` rather than `ctx.tools`: the plugin declares only
  // `systemPrompt`, and reading an undeclared service through the property
  // accessor throws ("cannot get property ... without inject"). A deployment
  // without the tools service must degrade to a no-op, not fail the preset.
  const tools = ctx.get('tools');
  if (tools === undefined) return;
  const rewrite = (text) => scrubText(text, state.replacements, state.bareToken);
  const view = tools.view();
  for (const [name, registration] of view.registrations) {
    // Track the REGISTRATION OBJECT, not the name: a tool disposed and
    // re-registered under the same name carries different documentation, and
    // skipping by name would leave its brand text unshadowed.
    if (name === 'run_code' || state.tools.get(name) === registration) continue;
    const definition = registration.definition;
    const description = typeof definition.description === 'string' ? definition.description : '';
    const scrubbedDescription = rewrite(description);
    const parameters = definition.parameters === undefined
      ? undefined
      : scrubSchemaDocs(definition.parameters, rewrite);
    const parametersChanged = parameters !== undefined
      && JSON.stringify(parameters) !== JSON.stringify(definition.parameters);
    // A tool's OUTPUT schema is a third documentation surface. `dsh-tools`
    // never shows it to the model, but the PTC executor's `renderSdk()` feeds
    // `definition.output.schema` straight into its `tools:sdk` section, where
    // `renderType()` emits every nested `description` as a `#` comment. Verified
    // against `renderToolsSdkPy()`: without this, a branded output field lands
    // verbatim in the prompt. Scrubbed here for every executor, harmlessly.
    const output = definition.output !== undefined
      && definition.output.schema !== undefined
      ? { ...definition.output, schema: scrubSchemaDocs(definition.output.schema, rewrite) }
      : definition.output;
    const outputChanged = output !== definition.output
      && JSON.stringify(output) !== JSON.stringify(definition.output);
    if (scrubbedDescription === description && !parametersChanged && !outputChanged) {
      // Nothing to rewrite: leave the original registration in place.
      state.tools.set(name, registration);
      continue;
    }
    state.tools.set(name, registration);
    try {
      ctx.effect(() => tools.register({
        ...definition,
        description: scrubbedDescription,
        ...parameters === undefined ? {} : { parameters },
        ...output === undefined ? {} : { output },
      }, registration.when === undefined ? {} : { when: registration.when }), 'env-identity.shadow-tool()');
    } catch (error) {
      const message = String(error?.message ?? error);
      if (!/already registered|duplicate/i.test(message)) {
        state.failed.push(`tool:${name}: ${message}`);
        ctx.logger?.warn?.(`env-identity: could not shadow tool "${name}": ${message}`);
      }
    }
  }
}

/**
 * Re-register any `complete: true` prompt section with a scrubbed twin that
 * KEEPS the `complete` flag.
 *
 * `SystemPrompt.assemble()` restores a complete section as the sole prompt
 * section AFTER the assembly waterfall (`sections: [completeSection]`, built
 * from the pre-waterfall snapshot). So the waterfall scrub cannot touch it: the
 * brand text comes back verbatim. Measured, not inferred — a `complete: true`
 * persona leaked "DeepSeek Harness. DSH rules." straight through.
 *
 * The fix is the same shadowing used everywhere else, with one twist: the twin
 * must also be `complete`, or assembly would reject two-complete or fall back
 * to a non-complete section and change what the model receives.
 *
 * The shipped `standard-env` / `ptc-env` rows configure `persona.complete:
 * false`, so this is defence in depth for a deployment that turns it on.
 */
function shadowCompleteSections(ctx, state, scope) {
  const prompt = ctx.systemPrompt;
  const layers = prompt.layers;
  if (layers === undefined) return;
  // Resolution: global first, then each scoped layer ancestor-first, nearest
  // last — exactly `ScopedLayers.merge`. Rebuilt here rather than by calling
  // `merge()`, because the scope token is module-private (`Symbol("dsh.scope")`
  // inside dsh-scope) and this package stays dependency-free.
  /**
   * The layer THIS plugin is mounted into, identified WITHOUT guessing.
   *
   * `dsh-scope` tags each context with a module-private symbol, so the scope
   * key is not readable from here. Two earlier attempts were wrong:
   *
   *   - iterate every scoped layer: `merged` is keyed by section NAME, so the
   *     last preset wins a shared name and an in-place patch edits the WRONG
   *     preset (measured: the preset that mounted us kept the brand and the
   *     one that did not got scrubbed);
   *   - recognise our layer by "has `harness:identity` AND a dev-context row":
   *     with `silenceDevContext: false` layer 1b registers nothing, the
   *     detection fails, and the `complete: true` prompt leaks again (measured).
   *
   * `ScopedLayers.effect()` files every registration under `scopeOf(ctx)`, so
   * the layer that owns OUR identity section IS our layer — for any config.
   * It is read back here after `apply()` has registered that section.
   */
  const ownLayerOf = () => {
    try {
      const scoped = layers.scoped;
      if (!(scoped instanceof Map)) return undefined;
      const mine = state.identity;
      if (mine === undefined) return undefined;
      for (const layer of scoped.values()) {
        if (layer.sections.get(IDENTITY_SECTION) === mine) return layer;
      }
    } catch { /* fall through */ }
    return undefined;
  };
  const ownLayer = ownLayerOf();

  let merged;
  try {
    merged = new Map(layers.global.sections.entries());
    if (scope !== undefined) {
      for (const layer of layers.chainLayers(scope)) {
        for (const [name, section] of layer.sections.entries()) merged.set(name, section);
      }
    } else if (ownLayer !== undefined) {
      for (const [name, section] of ownLayer.sections.entries()) merged.set(name, section);
    }
  } catch {
    return;
  }
  const rewrite = (text) => scrubText(text, state.replacements, state.bareToken);

  /**
   * Is this exact section object reachable from more than one layer? Patching
   * is only safe on an object one preset owns: a shared instance would leak the
   * rewrite into other presets and into the global view.
   */
  const sharedObject = (target) => {
    let seen = 0;
    const count = (layer) => {
      try {
        for (const section of layer.sections.values()) if (section === target) seen++;
      } catch { /* unattachable layer: ignore */ }
    };
    count(layers.global);
    try {
      if (layers.scoped instanceof Map) for (const layer of layers.scoped.values()) count(layer);
    } catch { /* ignore */ }
    return seen > 1;
  };

  /**
   * Last resort for a complete section registered in the SAME layer we mount
   * into (`dsh-persona` does this, and the shipped `minimal` preset sets
   * `complete: true`). Re-registering the name here throws by design, and the
   * assembly waterfall never sees the text because `assemble()` restores it
   * from the pre-waterfall snapshot. What is left is the registry entry itself:
   * assembly resolves `sectionByName.get(name).text` on every request, so
   * replacing that one property makes the scrub effective for this scope.
   *
   * Semantics preserved: a function stays a function, `interpolate` is left
   * untouched, and the original text is restored when this plugin unloads.
   */
  const patchInPlace = (name, section) => {
    // Defence in depth: only ever rewrite a section this preset actually owns.
    // Mutating anything else would edit another preset's prompt.
    if (ownLayer !== undefined && ownLayer.sections.get(name) !== section) {
      return 'section is not registered in this preset\'s own layer';
    }
    if (Object.isFrozen(section)) return 'section object is frozen';
    if (sharedObject(section)) return 'section object is shared across layers';
    // Idempotency is enforced by the caller: `state.complete` records the
    // section OBJECT per name, so a rescan on the same object never reaches
    // here twice. (A separate per-object guard existed and was dead code —
    // mutation-testing it proved nothing failed when it was removed.)
    const original = section.text;
    const wrapped = typeof original === 'function'
      ? (context) => rewrite(original(context))
      : rewrite(original);
    try {
      section.text = wrapped;
    } catch (error) {
      return String(error?.message ?? error);
    }
    ctx.effect(() => () => {
      // Only restore what we actually installed: a re-registration by the
      // owning plugin replaces the object, and then this one is inert.
      if (section.text === wrapped) section.text = original;
    }, 'env-identity.complete-in-place()');
    return undefined;
  };

  for (const [name, section] of merged.entries()) {
    if (section.complete !== true) continue;
    if (name === IDENTITY_SECTION) continue;
    const previous = state.complete.get(name);
    if (previous === section) continue;
    try {
      ctx.effect(() => prompt.section({
        ...section,
        name,
        complete: true,
        ...(section.interpolate === false ? { interpolate: false } : {}),
        text: (context) => rewrite(
          typeof section.text === 'function' ? section.text(context) : section.text,
        ),
      }), 'env-identity.shadow-complete()');
      state.complete.set(name, section);
      continue;
    } catch (error) {
      const message = String(error?.message ?? error);
      // Same-layer duplicate: fall through to the in-place patch below.
      if (!/already registered/.test(message)) {
        state.failed.push(`complete:${name}: ${message}`);
        ctx.logger?.warn?.(`env-identity: could not shadow complete section "${name}": ${message}`);
        continue;
      }
    }
    const problem = patchInPlace(name, section);
    state.complete.set(name, section);
    if (problem !== undefined) {
      state.failed.push(`complete:${name}: ${problem}`);
      if (state.warnComplete) {
        ctx.logger?.warn?.(
          `env-identity: prompt section "${name}" is complete:true in this preset's own scope (${problem}); `
          + 'it replaces the whole prompt and its text cannot be rewritten here',
        );
      }
    }
  }
}

/**
 * Register the identity replacement, the context/tool shadows, the loop-message
 * scrub, and the assembly scrub for the mounting preset's scope.
 *
 * @param {object} ctx - the preset-scope context (a global context would
 *   collide with the owners of `harness:identity` / `harness:source`).
 * @param {object} config - see {@link DEFAULT_REPLACEMENTS} and `apply` below.
 */
function apply(ctx, config = {}) {
  const {
    identity = 'You are an AI coding agent working inside an agentic coding environment.',
    silenceDevContext = true,
    replacements = DEFAULT_REPLACEMENTS,
    scrubToolDescriptions = true,
    scrubLoopMessages = true,
    bareToken = true,
  } = config;

  if (typeof identity !== 'string' || identity.trim().length === 0) {
    throw new Error('env-identity: config.identity must be a non-empty string');
  }
  // A `complete: true` section becomes the ENTIRE prompt, restored from the
  // pre-waterfall snapshot after the assembly scrub has run. It is handled by
  // `shadowCompleteSections()` — same-name shadow when the section lives in an
  // ancestor layer, in-place rewrite when it lives in this layer. This knob
  // only silences the diagnostic emitted when BOTH are impossible.
  const pairs = normalizeReplacements(replacements);
  // The identity section is built FIRST: `state.identity` points at it, and the
  // object is how `shadowCompleteSections()` recognises this preset's own layer.
  // Reading it before its declaration threw a TDZ ReferenceError, which Cordis
  // answers by rolling back EVERY effect of the plugin — leaving the preset
  // silently unmodified while a shallow test still looked plausible.
  const identitySection = {
    name: IDENTITY_SECTION,
    order: ctx.systemPrompt.getSectionOrder('HARNESS_IDENTITY') ?? IDENTITY_ORDER,
    text: identity,
    interpolate: false,
  };
  const state = {
    replacements: pairs,
    bareToken: bareToken !== false,
    /** Context name -> the provider object already handled (identity, not name). */
    contexts: new Map(),
    /** Context names THIS plugin owns in its own scope — never shadow again. */
    owned: new Set(),
    /** The identity section object this plugin registered (own-layer marker). */
    identity: identitySection,
    /** `complete: true` section name -> the section object already handled. */
    complete: new Map(),
    /** Whether an unrewritable complete section should be reported. */
    warnComplete: config.completeSectionWarning !== false,
    /** Tool name -> the registration object already handled (identity, not name). */
    tools: new Map(),
    /** Names that could not be shadowed, for the diagnostic surfaced below. */
    failed: [],
  };

  // Every registration below is individually contained. Cordis answers a throw
  // from `apply()` by rolling back ALL of the plugin's effects, so one bad row
  // would silently restore the brand on every surface while a shallow test
  // still looked plausible — that is exactly how a TDZ ReferenceError in this
  // file once disabled the whole preset with no diagnostic anywhere.
  const guarded = (label, fn) => {
    try {
      fn();
    } catch (error) {
      const message = String(error?.message ?? error);
      state.failed.push(`${label}: ${message}`);
      ctx.logger?.warn?.(`env-identity: ${label} failed: ${message}`);
    }
  };

  // 1. Identity: same section name in this scope replaces the global sentence.
  //    A failure here is fatal for the whole package's purpose, so it is both
  //    guarded (keeps the other layers alive) and recorded.
  guarded('identity', () => ctx.effect(
    () => ctx.systemPrompt.section(identitySection),
    'env-identity.section()',
  ));

  // 1b. Harness-maintenance sections/contexts: shadow them to empty.
  if (silenceDevContext) {
    for (const row of DEV_CONTEXT_ROWS) {
      // Record ownership BEFORE registering: `shadowContexts()` must skip these
      // names, and re-registering one throws a duplicate inside `ctx.effect`.
      state.owned.add(row.name);
      guarded(`dev-section:${row.name}`, () => ctx.effect(() => ctx.systemPrompt.section({
        name: row.name,
        order: ctx.systemPrompt.getSectionOrder(row.slot) ?? row.sectionFallback,
        text: '',
        interpolate: false,
      }), 'env-identity.dev-section()'));
      guarded(`dev-context:${row.name}`, () => ctx.effect(() => ctx.systemPrompt.context({
        name: row.name,
        order: ctx.systemPrompt.getContextOrder(row.slot) ?? row.contextFallback,
        text: '',
        interpolate: false,
      }), 'env-identity.dev-context()'));
    }
  }

  // 2. Runtime contexts: delegating scrub that survives refreshContext().
  if (scrubLoopMessages) {
    const rescanContexts = () => {
      try {
        shadowContexts(ctx, state);
      } catch (error) {
        ctx.logger?.warn?.(`env-identity: context shadow stopped early: ${String(error)}`);
      }
    };
    rescanContexts();
    ctx.effect(() => ctx.on('system-prompt/change', rescanContexts), 'env-identity.context-rescan()');
  }

  // 3. Tool schemas: same-name shadow with a scrubbed description.
  if (scrubToolDescriptions) {
    const rescanTools = () => {
      try {
        shadowTools(ctx, state);
      } catch (error) {
        ctx.logger?.warn?.(`env-identity: tool shadow stopped early: ${String(error)}`);
      }
    };
    rescanTools();
    ctx.effect(() => ctx.on('tools/change', rescanTools), 'env-identity.tool-rescan()');
  }

  // 3b. `complete: true` sections. Registered at mount time from the materialized
  //     layers: a complete section is restored from the PRE-waterfall snapshot as
  //     the sole prompt section, so the assembly scrub can never reach it.
  {
    const rescanComplete = () => {
      try {
        shadowCompleteSections(ctx, state);
      } catch (error) {
        ctx.logger?.warn?.(`env-identity: complete-section shadow stopped early: ${String(error)}`);
      }
    };
    rescanComplete();
    ctx.effect(() => ctx.on('system-prompt/change', rescanComplete), 'env-identity.complete-rescan()');
  }

  // 4. Loop-injected user messages. MUST be outermost: dsh-tool-skill appends
  //    both the catalog AND skill bodies after awaiting next(), so an inner
  //    listener never sees them.
  if (scrubLoopMessages) {
    const onPreStep = async (payload, next) => {
      const decision = await next();
      if (decision?.kind === 'reject' || !Array.isArray(decision?.messages)) return decision;
      // Messages this listener is allowed to rewrite. Everything a loop plugin
      // INJECTS as a user turn is in this set; anything a human or the model
      // said is not, and must never be rewritten.
      //
      // The set is keyed on `source.kind` rather than "any user message" so the
      // conversation itself stays untouched. `skill-invocation` matters as much
      // as `skill-catalog`: it carries the skill BODY, appended the same way.
      const injectable = new Set([
        'skill-catalog',
        'skill-invocation',
        'runtime-context',
        'time-context',
        'developer-instructions',
      ]);
      // The messages that arrived from the caller are not injectable; a plugin
      // may legitimately reuse the same `kind`, so exclude by identity too.
      const incoming = new Set(
        (Array.isArray(payload?.messages) ? payload.messages : []).map((m) => m?.id),
      );
      let changed = false;
      const messages = decision.messages.map((message) => {
        if (message?.id !== undefined && incoming.has(message.id)) return message;
        if (!injectable.has(message?.source?.kind)) return message;
        if (!Array.isArray(message.content)) return message;
        let touched = false;
        const content = message.content.map((block) => {
          if (block?.type !== 'text' || typeof block.text !== 'string') return block;
          const text = scrubText(block.text, state.replacements, state.bareToken);
          if (text === block.text) return block;
          touched = true;
          return { ...block, text };
        });
        if (!touched) return message;
        changed = true;
        // `source.entries` / `source.name` stay byte-identical: the catalog
        // digest and the skill name are identity, not prose.
        return { ...message, content };
      });
      return changed ? { ...decision, messages } : decision;
    };
    ctx.effect(() => ctx.on('agent/pre-step', onPreStep, { prepend: true }), 'env-identity.pre-step()');
  }

  // 5. Last resort: scrub whatever the four layers above did not own.
  const onAssemble = async (_assembly, _context, next) =>
    scrubAssembly(await next(), state.replacements, state.bareToken);
  ctx.effect(() => ctx.on('system-prompt/assemble', onAssemble), 'env-identity.scrub()');
}

const name = 'env-identity';
/** Every service is optional: a deployment without tools or skills still works. */
const inject = ['systemPrompt'];

export {
  BARE_BRAND,
  DEFAULT_REPLACEMENTS,
  DEV_CONTEXT_ROWS,
  IDENTITY_SECTION,
  NEUTRAL,
  apply,
  inject,
  name,
  scrubAssembly,
  scrubSchemaDocs,
  scrubText,
};
