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
      //
      // BOUNDED LOOKAHEAD. Slicing the whole remaining text per match is O(n)
      // each, which made a prompt dense with brand tokens QUADRATIC: 32KB took
      // 1.7s and a 200KB context took 66s — on every model step. The predicate
      // only reads the next word and the preceding few characters, so it gets
      // a bounded window. `pieces.join` also avoids repeated string concat.
      const from = pair[0];
      const WINDOW = 64;
      if (!out.includes(from)) continue;
      // Native `replace` with a function callback: V8 drives the scan and the
      // rebuild, which is dramatically faster than a manual indexOf/pieces loop
      // on a prompt dense with the phrase. A bounded window is still what the
      // predicate sees (the whole tail made this quadratic).
      out = out.replaceAll(from, (match, offset, whole) => {
        const after = whole.slice(offset + match.length, offset + match.length + WINDOW);
        const before = offset === 0 ? '' : whole.slice(Math.max(0, offset - WINDOW), offset);
        const decision = to(after, before);
        return decision === undefined ? match : decision;
      });
      continue;
    }
    // A pair without a target must NOT delete the phrase: `['a']` in a
    // hand-edited table would otherwise strip every "a" from the prompt
    // (measured: "You re n AI coding gent"). Missing target = leave it alone.
    out = out.split(pair[0]).join(to === undefined ? pair[0] : to);
  }
  if (bareToken) {
    // Capitalise when the token began a sentence: a bare `DSH rules apply`
    // becomes "The … rules apply", not "the … rules apply". Skipped when the
    // surrounding text is CJK — an English article at the head of a Chinese
    // sentence reads worse than the lowercase form.
    //
    // BOUNDED WINDOW. This callback used to slice the WHOLE string on each
    // match to look one character back and one word forward. On a prompt dense
    // with the token that is quadratic: 16KB took 371ms and 200KB took 66s —
    // on every model step. Both checks only need a short window.
    const WINDOW = 24;
    out = out.replace(BARE_BRAND, (match, offset, whole) => {
      const head = whole.slice(Math.max(0, offset - WINDOW), offset);
      const tail = whole.slice(offset + match.length, offset + match.length + WINDOW);
      const atSentenceStart = SENTENCE_START.test(head)
        // A match at the very start of the text has no head to inspect.
        || (offset === 0 && head.length === 0);
      // Look past whitespace on both sides: "DSH 的规则" and "规则 DSH" are CJK
      // contexts even though the immediate neighbour is a space.
      const after = tail.replace(/^\s+/, '').charAt(0);
      const before = head.replace(/\s+$/, '').slice(-1);
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
  // `null` means "no phrase pairs" rather than "a mistake": throwing here would
  // make Cordis roll back EVERY registration of the plugin, so a deployment
  // that nulled this field would silently lose the identity replacement too.
  // Anything else non-array is still a genuine configuration error.
  if (replacements === null || replacements === undefined) return [];
  if (!Array.isArray(replacements)) {
    throw new Error('env-identity: config.replacements must be an array of [from, to] pairs');
  }
  return replacements.filter(
    (pair) => Array.isArray(pair)
      && typeof pair[0] === 'string'
      // A one-character `from` is a typo, not a phrase: replacing every "a" or
      // "e" would shred the prompt. Require at least two characters.
      && pair[0].trim().length >= 2
      && (typeof pair[1] === 'string' || typeof pair[1] === 'function'),
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
 *
 * Both the section path and the context path need this, and both need the
 * same answer: `shadowContexts()` must scan exactly this layer and no other.
 *
 * @param prompt - the `systemPrompt` service.
 * @param state - plugin state; `state.identity` is the section we registered.
 * @returns our own scoped layer, or `undefined` when it cannot be identified.
 */
function ownLayerOf(prompt, state) {
  try {
    const scoped = prompt?.layers?.scoped;
    if (!(scoped instanceof Map)) return undefined;
    const mine = state?.identity;
    if (mine === undefined) return undefined;
    for (const layer of scoped.values()) {
      if (layer.sections.get(IDENTITY_SECTION) === mine) return layer;
    }
  } catch { /* fall through */ }
  return undefined;
}

/**
 * The scope KEY this plugin is mounted under.
 *
 * `dsh-scope` keeps the key module-private, but the registry maps key -> layer
 * and the layer that owns our identity section is ours, so the key can be read
 * back by identity without importing the symbol. Other scoped registries
 * (`tools`, for one) key their layers with the SAME object, which is what lets
 * this package address its own layer there.
 *
 * @returns the scope key, or `undefined` when it cannot be identified.
 */
function ownScopeKeyOf(prompt, state) {
  try {
    const scoped = prompt?.layers?.scoped;
    if (!(scoped instanceof Map)) return undefined;
    const mine = state?.identity;
    if (mine === undefined) return undefined;
    for (const [key, layer] of scoped.entries()) {
      if (layer.sections.get(IDENTITY_SECTION) === mine) return key;
    }
  } catch { /* fall through */ }
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
  let ownTable;
  try {
    // ONLY the layer this plugin is mounted into. Sibling PRESETS must never
    // be scanned — see the ownership note above.
    //
    // Scanning every scoped layer was a real, shipped regression: another
    // preset's `tool:subagent:depth` provider looked like an unshadowed
    // global, so this plugin claimed that name in OUR layer. The preset's own
    // `tool-subagent` row then tried to register the same name in the SAME
    // layer and threw `prompt context "tool:subagent:depth" is already
    // registered in this scope` — which fails preset activation outright
    // (`agent-preset/invalid`) and blocks every new session on the preset.
    ownTable = ownLayerOf(prompt, state)?.contexts;
  } catch {
    return;
  }
  if (ownTable === undefined) return;

  let entries;
  try {
    entries = [...ownTable.entries()];
  } catch {
    return;
  }
  for (const [name, provider] of entries) {
    // The bookkeeping stores the PROVIDER OBJECT that was handled, not just
    // the name. A provider disposed and re-registered under the same name is
    // a different object with different text: skipping by name alone left
    // its brand text unshadowed (measured — a re-registered
    // `probe:ctx` came back "DeepSeek Harness context" verbatim).
    if (state.contexts.get(name) === provider) continue;
    // Layer 1b already owns this name in our scope; nothing to do.
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

    // A provider in OUR OWN layer cannot be shadowed by re-registering: the
    // name is taken in the very layer this plugin writes to. Edit the entry
    // the registry already holds instead — but ONLY that one.
    //
    // Doing it in place (never registering) also keeps the name available: a
    // SIBLING row that declares the same name later registers it normally,
    // and `system-prompt/change` rescans this table and scrubs the new object
    // too. Claiming the name with a shadow object here made that row fail
    // activation with `already registered in this scope`.
    const problem = patchProviderInPlace(ctx, state, ownTable, name, provider);
    if (problem !== undefined) {
      state.failed.push(`context:${name}: ${problem}`);
      ctx.logger?.warn?.(
        `env-identity: runtime context "${name}" is registered in this preset's own layer `
        + `(${problem}); its text cannot be rewritten here`,
      );
    }
  }
}

/**
 * Shadow INHERITED runtime contexts into one live Agent's own layer.
 *
 * Inherited (global/ancestor) contexts cannot be shadowed from the preset
 * layer: registering the name there OCCUPIES it, so a sibling row of the same
 * preset that declares that name afterwards fails activation with
 * `already registered in this scope`. That is not hypothetical — `dsh-base`
 * mounts a global `tool-subagent`, every shipped preset re-declares it, and
 * the preset then cannot compose at all (`agent-preset/invalid`, every new
 * session refused).
 *
 * The agent's own layer is the right home: it is nearer than both the preset
 * and the global layer, so it wins the name without occupying anyone else's
 * namespace, and `assemble()` / `refreshContext()` both merge it because the
 * very same scope key is passed as `context.scope`.
 *
 * @param ctx - this plugin's (preset-scoped) context.
 * @param state - plugin state; `agentShadows` holds the installed objects.
 * @param agent - the live Agent whose layer receives the shadows.
 */
function shadowContextsForAgent(ctx, state, agent) {
  const prompt = ctx.get('systemPrompt');
  if (prompt?.layers === undefined || agent?.ctx === undefined) return;
  let merged;
  try {
    merged = prompt.layers.merge(agent, (layer) => layer.contexts);
  } catch {
    return;
  }
  const ownTable = ownLayerOf(prompt, state)?.contexts;
  // One INDIRECTION per name, installed once and never replaced.
  //
  // The shadow's `text` resolves the CURRENT winning provider out of the live
  // registry on every call instead of closing over the object it saw. A
  // closed-over copy goes stale the moment that provider is disposed and
  // re-registered under the same name (a rebuilt preset, an HMR reload, a
  // row mounted after the first turn): measured — the newer provider's text
  // never appeared, the OLD wrapper kept rendering, and the agent read a
  // context nobody had registered any more.
  const installed = state.agentShadows.get(agent) ?? new Map();
  const pending = [];
  for (const [name, provider] of merged) {
    // Own-layer providers are handled in place by `shadowContexts()`; a
    // registered twin for one of them would be redundant.
    if (ownTable !== undefined && ownTable.get(name) === provider) continue;
    if (state.owned.has(name)) continue;
    if (installed.has(name)) continue;
    const text = provider.text;
    if (typeof text !== 'function' && scrubText(text, state.replacements, state.bareToken) === text) continue;
    pending.push([name, provider]);
  }
  if (pending.length === 0) return;

  // Every wrapper this agent has installed, by object identity. The resolver
  // must never walk INTO one of these: the wrapper delegates to whatever wins
  // the name, and a wrapper that wins the name would delegate to itself
  // (measured: RangeError, maximum call stack size exceeded).
  const wrappers = state.agentWrappers.get(agent) ?? new Set();
  state.agentWrappers.set(agent, wrappers);

  for (const [name, provider] of pending) {
    installed.set(name, provider);
    // Resolve the CURRENT winner out of the live registry, skipping the agent's
    // own layer (where these wrappers live) and every wrapper object.
    const resolveCurrent = () => {
      try {
        const merged = new Map(prompt.layers.global.contexts.entries());
        for (const layer of prompt.layers.chainLayers(agent)) {
          for (const [key, value] of layer.contexts.entries()) {
            if (wrappers.has(value)) continue;
            merged.set(key, value);
          }
        }
        const winner = merged.get(name);
        return winner === undefined || wrappers.has(winner) ? provider : winner;
      } catch {
        return provider;
      }
    };
    try {
      // `agent.ctx` IS the agent's scope, so this row is owned by that agent:
      // it appears for that agent at assembly time and disappears with it.
      const wrapper = {
        ...provider,
        name,
        text: (context) => {
          const current = resolveCurrent();
          const text = current.text;
          const raw = typeof text === 'function' ? text(context) : text;
          return scrubText(raw, state.replacements, state.bareToken);
        },
      };
      wrappers.add(wrapper);
      agent.ctx.effect(() => {
        const undo = prompt.context(wrapper);
        return () => {
          wrappers.delete(wrapper);
          undo();
        };
      }, 'env-identity.agent-context()');
    } catch (error) {
      const message = String(error?.message ?? error);
      state.failed.push(`agent-context:${name}: ${message}`);
      ctx.logger?.warn?.(`env-identity: could not shadow context "${name}" for agent "${agent.id}": ${message}`);
    }
  }
  state.agentShadows.set(agent, installed);
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
 * Rewrite one tool definition the registry ALREADY holds, in place.
 *
 * Used for tools registered in this plugin's own layer: re-registering the
 * name there throws `already registered in this scope`, and a definition in a
 * nearer layer could never be reached by a farther one. `ToolsService`
 * projects the schema out of `registration.definition` on every step, so
 * replacing the few documented fields is enough — and it is exact, because a
 * definition object belongs to one preset's row (measured: two presets
 * mounting the same tool row get distinct definition objects).
 *
 * Every listed guard is real:
 *   - a frozen definition cannot be edited; report and leave it alone;
 *   - a definition reachable from more than one registration would leak the
 *     rewrite into another preset;
 *   - `execute`/`render`/`when` and schema DATA must survive untouched, so
 *     only `description`, `parameters` and `output` are replaced;
 *   - the original fields are restored on unload, and only while the field is
 *     still the value this plugin installed.
 *
 * @returns `undefined` on success, or a short reason why it refused.
 */
function patchToolInPlace(ctx, state, name, registration, rewrite) {
  const definition = registration.definition;
  if (Object.isFrozen(definition)) return 'definition object is frozen';
  // Identity check across every layer: a shared definition must not be edited.
  try {
    let seen = 0;
    const count = (layer) => {
      try {
        for (const candidate of layer.tools.values()) if (candidate.definition === definition) seen++;
      } catch { /* unattachable layer */ }
    };
    const layers = ctx.get('tools')?.layers;
    if (layers !== undefined) {
      count(layers.global);
      if (layers.scoped instanceof Map) for (const layer of layers.scoped.values()) count(layer);
    }
    if (seen > 1) return 'definition object is shared across layers';
  } catch { /* fall through to the patch */ }

  const restore = [];
  const replace = (field, next) => {
    if (next === undefined || next === definition[field]) return;
    const original = definition[field];
    try {
      definition[field] = next;
    } catch (error) {
      state.failed.push(`tool:${name}: ${String(error?.message ?? error)}`);
      return;
    }
    restore.push(() => {
      // Another owner may have re-registered this tool and replaced the field
      // value; restoring then would clobber their data.
      if (definition[field] === next) definition[field] = original;
    });
  };

  // `description` is optional on a tool definition. Absent must STAY absent:
  // writing `''` there would turn "no documentation" into "empty
  // documentation", a change nobody asked this package to make.
  if (typeof definition.description === 'string') {
    replace('description', rewrite(definition.description));
  }
  if (definition.parameters !== undefined) {
    replace('parameters', scrubSchemaDocs(definition.parameters, rewrite));
  }
  if (definition.output !== undefined && definition.output.schema !== undefined) {
    replace('output', { ...definition.output, schema: scrubSchemaDocs(definition.output.schema, rewrite) });
  }
  if (restore.length > 0) {
    ctx.effect(() => () => {
      for (const undo of restore.reverse()) undo();
    }, 'env-identity.tool-in-place()');
  }
  return undefined;
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

  // Which tools can be shadowed by RE-REGISTERING under the same name?
  //
  // Only the ones this scope inherits. The deployment this package ships for
  // disables every tool row globally and re-declares them inside each preset
  // (`tool-bash`, `tool-fs`, ...), so the tools the model actually gets are
  // registered in the PRESET layer — the very layer this plugin registers
  // into. `tools.view()` with no scope reports the GLOBAL view, which in that
  // deployment is empty: every tool description kept its brand text
  // (measured: `probe_tool` stayed "Export the DSH Web UI DOM snapshot.").
  //
  // So: shadow the inherited (global + ancestor) tools by re-registration, and
  // handle our own layer's tools by rewriting the registration in place, which
  // is the only mechanism that can win there.
  const own = tools.layers?.peek?.(state.scope);
  const view = tools.view(state.scope);
  for (const [name, registration] of view.registrations) {
    // Track the REGISTRATION OBJECT, not the name: a tool disposed and
    // re-registered under the same name carries different documentation, and
    // skipping by name would leave its brand text unshadowed.
    if (name === 'run_code' || state.tools.get(name) === registration) continue;
    // A tool registered in OUR OWN layer: re-registering the name here throws,
    // so the scrub has to edit the definition the registry already holds.
    if (own !== undefined && own.tools.get(name) === registration) {
      state.tools.set(name, registration);
      patchToolInPlace(ctx, state, name, registration, rewrite);
      continue;
    }
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
  const ownLayer = ownLayerOf(prompt, state);

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
  // Booleans are read strictly: `bareToken: "no"` from a YAML-ish config file
  // used to be truthy and silently turned the rule ON, which is the opposite of
  // what the author wrote. Only literal `false` disables a flag.
  const {
    identity = 'You are an AI coding agent working inside an agentic coding environment.',
    replacements = DEFAULT_REPLACEMENTS,
  } = config;
  const flag = (value, fallback) => (value === undefined ? fallback : value !== false && value !== 'false');
  const silenceDevContext = flag(config.silenceDevContext, true);
  const scrubToolDescriptions = flag(config.scrubToolDescriptions, true);
  const scrubLoopMessages = flag(config.scrubLoopMessages, true);
  const bareToken = flag(config.bareToken, true);

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
    /** Agent -> the context names already shadowed in that agent's own layer. */
    agentShadows: new WeakMap(),
    /** Agent -> the wrapper objects installed in that agent's layer. */
    agentWrappers: new WeakMap(),
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
    /**
     * The scope key this plugin is mounted under, or `undefined` when it has
     * none. `shadowTools()` needs it to tell "inherited, shadow by
     * re-registering" from "my own layer, rewrite in place" — `view()` without
     * a scope reports the GLOBAL view, which is the wrong question here.
     *
     * Read lazily by the first rescan, not here: the identity section has to
     * be registered first for the layer to be identifiable.
     */
    scope: undefined,
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
    // Inherited contexts are shadowed per AGENT, never in the preset layer:
    // registering the name there would occupy it and break a sibling row that
    // declares the same name (`dsh-base`'s global `tool-subagent` versus the
    // preset's own row is exactly that shape).
    ctx.effect(() => ctx.on('agent/created', ({ agent }) => {
      try {
        shadowContextsForAgent(ctx, state, agent);
      } catch (error) {
        ctx.logger?.warn?.(`env-identity: agent context shadow stopped early: ${String(error)}`);
      }
    }), 'env-identity.agent-created()');
  }

  // 3. Tool schemas: same-name shadow with a scrubbed description.
  if (scrubToolDescriptions) {
    // Resolve our own scope once, AFTER the identity section above exists:
    // that section is the marker by which the owning layer — and therefore the
    // key other scoped registries use — is read back.
    if (state.scope === undefined) state.scope = ownScopeKeyOf(ctx.systemPrompt, state);
    const rescanTools = () => {
      try {
        // The key can appear late (a deployment that registers the identity
        // section after us), so a missing one is retried on every rescan.
        if (state.scope === undefined) state.scope = ownScopeKeyOf(ctx.systemPrompt, state);
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
