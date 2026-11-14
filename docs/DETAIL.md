# Agentic environment presets

Two agent presets that keep the shipped **Standard** and **PTC** tools and policies
exactly as they are, and change only one thing: the system prompt describes a plain
*agentic coding environment* instead of naming the harness.

Pick `标准模式（中性环境）` (`standard-env`) or `PTC 模式（中性环境）` (`ptc-env`) when
creating a new session. Existing sessions keep the preset they started with.

## Install

Pick one of these — no build step, no native dependency, no install script.

```sh
# from npm (recommended) — pinned form: dsh-agentic-env-presets@1.1.0
dsh plugin --profile web add dsh-agentic-env-presets

# from GitHub (tracks the default branch, includes unreleased commits)
dsh plugin --profile web add https://github.com/Jing494/agentic-env-presets

# from a local checkout, live-linked for editing
dsh plugin --profile web add link:/path/to/agentic-env-presets
```

Or use the install box on this page. It takes exactly three shapes: the **npm
package name** (`dsh-agentic-env-presets`, optionally `@1.1.0`), a **GitHub
repository URL** (`https://github.com/Jing494/agentic-env-presets`), or an
**absolute local directory path**.

It does **not** take the npm web page URL (`https://www.npmjs.com/package/…`),
a whole command line (`dsh plugin add …`), the bare `owner/repo` pair, or a
relative path.

Check it loaded — the number should be `2`:

```sh
dsh --profile web --dump-config | grep -c env-identity
```

A bundle that cannot load is skipped at startup with a diagnostic naming the
reason, and the profile still boots.

## What it does

A preset cannot turn off the deployment-level `includeHarnessIdentity` switch, and it
must not patch framework prompt strings globally — that would poison every other
session. What a preset *can* do is contribute prompt sections **in its own scope**, and
the registry's scoped layers are keyed by section name, so a same-named registration
**shadows** the global one for this preset's agents and only for them.

Six layers, in priority order:

1. **Replace the identity** — re-register `harness:identity` in the preset scope.
2. **Silence harness-maintenance context** — register `harness:source` and
   `app:web-surface` (both the section and the runtime-context halves) with empty text.
3. **Shadow the runtime contexts** — re-register each under its own name with a
   `text` function that calls the original provider and scrubs the result. The loop
   calls `refreshContext()` *after* the assembly waterfall and re-resolves every
   provider, so a waterfall-only scrub leaves this surface untouched.
4. **Shadow tool descriptions** — re-register each branded tool under its own name,
   rewriting all three documentation surfaces: the top-level `description`, the nested
   `description`/`title` inside `parameters`, **and the same fields inside
   `output.schema`** (`enum`/`default`/property names stay untouched, since they are
   data), while forwarding every other callback. PTC mode inlines all three into
   `tools:sdk`, so both executors are covered.
5. **Rewrite a `complete: true` prompt** — such a section is restored by
   `assemble()` *after* the waterfall, from the pre-waterfall snapshot, as the entire
   prompt, so none of the four layers above can reach it. An ancestor-layer section is
   shadowed by name (keeping `complete`); a section in **this preset's own** layer
   cannot be re-registered at all, so the object's text is rewritten **in place**
   (after checking it is neither frozen nor shared, and restored on unload).
6. **Scrub what is left** — a `system-prompt/assemble` fallback, plus an outermost
   (`{prepend:true}`) `agent/pre-step` listener that rewrites the skill-catalog message.

Brand text lives on **five** surfaces owned by four different subsystems, plus the
`complete: true` path that bypasses the waterfall entirely — hence six layers. Two are counter-intuitive:

- **Runtime context is re-resolved after the waterfall**, so scrubbing it only in the
  waterfall passes a unit test and leaks in the real request.
- **The skill catalog is appended after `next()`**, so the `agent/pre-step` listener
  must be outermost; a default inner registration scans an empty decision and then the
  catalog arrives with the brand intact.

The phrase table is literal `split/join`, and order matters (longest first). A bare
`DSH` falls to a narrow guarded regex, `(?<![\w$.\-])DSH(?![\w\-])`, which keeps
`$DSH_HOME`, `__DSH_BOOT__`, `engines.dsh` and friends byte-identical.

Deliberately **not** done: no global patch to framework strings, no `complete: true`
takeover (it would swallow tool guidance and break prompt caching), no renaming of
tools (that is the call surface).

## Configuration

```yaml
- id: env-identity
  name: 'dsh-agentic-env-presets'
  config:
    identity: You are an AI coding agent working inside an agentic coding environment.
    silenceDevContext: true        # optional, default true
    scrubToolDescriptions: true    # optional, default true; false = prompt+context only
    scrubLoopMessages: true        # optional, default true; false = leave loops alone
    bareToken: true                # optional, default true; false = phrase table only
    replacements:                  # optional, defaults to DEFAULT_REPLACEMENTS (whole table)
      - ['DSH（DeepSeek Harness）', 'the agentic coding environment']
      - ['DeepSeek Harness ', '']
      - ['DeepSeek Harness', 'the agentic coding environment']
      - ['DSH Marketplace', 'plugin marketplace']
      - ['DSH file policy', 'file policy']
      - ['DSH file sandbox', 'file sandbox']
      - ['extend DSH itself', 'extend the environment itself']
```

## Compatibility

`peerDependencies` declares `@deepseek-ai/dsh-system-prompt` as `>=0.1.0-0`, and the
manifest deliberately declares **no `engines.dsh`**. The shipped sections
(`harness:identity`, `harness:source`, `app:web-surface`) and the prompt API
(`getSectionOrder`, `getContextOrder`, `system-prompt/assemble`) are present from
`0.1.7` through `0.2.x`, so the bundle loads across the whole range instead of being
rejected the moment the engine moves past `0.2.5`.

If a future engine renames those sections, the bundle is **skipped at startup** with a
diagnostic naming the missing piece — the profile still boots.

## Verification

`verify.mjs` mounts the real prompt, tools, executor and agent packages, opens a preset
scope, chains an agent scope beneath it, then follows the loop's real order — assemble,
refresh, render, resolve tools, run the pre-step chain — and asserts on exact substrings
across twenty cases. Exit code 0 means all pass.

```sh
node verify.mjs            # or: node verify.mjs <path-to-dsh-installation>
```

The seven cases cover: default config, silencing off, baseline preset (must still show
the brand), after `refreshContext()`, tool schemas, the skill catalog (which must be
**actually rewritten**), and identifier safety.

**Run the mutation tests after any change**: dropping `{prepend:true}` must fail case 6,
and disabling the context shadow must fail case 4. A suite that always passes is not a
suite.

## Limits

This changes the **model-facing text**, not the product. The web GUI, CLI help, plugin
manager, marketplace copy, and onboarding still name the harness — a preset cannot
reach those, and should not try.

The only remaining gap is **skill names** and the on-disk `SKILL.md` files: the name is
the call surface (renaming breaks `skill()`), and the file lives outside the prompt
layer. Tool parameters and skill bodies are both covered since 1.2.0.

Licensed MIT.
