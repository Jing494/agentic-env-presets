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

Three layers, in priority order:

1. **Replace the identity** — re-register `harness:identity` in the preset scope.
2. **Silence harness-maintenance context** — register `harness:source` and
   `app:web-surface` (both the section and the runtime-context halves) with empty text.
3. **Scrub leftover phrases** — a scope-filtered `system-prompt/assemble` listener
   applies literal `[from, to]` pairs, never a regex.

Deliberately **not** done: no global patch to framework strings, no `complete: true`
takeover (it would swallow tool guidance and break prompt caching), no regex.

## Configuration

```yaml
- id: env-identity
  name: 'dsh-agentic-env-presets'
  config:
    identity: You are an AI coding agent working inside an agentic coding environment.
    silenceDevContext: true        # optional, default true
    replacements:                  # optional, defaults to DEFAULT_REPLACEMENTS
      - ['DeepSeek Harness ', '']
      - ['DeepSeek Harness', 'the agentic coding environment']
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

`verify.mjs` mounts the real prompt plugins, opens a preset scope, chains an agent
scope beneath it, and asserts on exact substrings across three cases: clean, clean with
silencing off, and a baseline preset that must still show the brand. Exit code 0 means
all pass.

```sh
node verify.mjs            # or: node verify.mjs <path-to-dsh-installation>
```

## Limits

This changes the **model-facing text**, not the product. The web GUI, CLI help, plugin
manager, marketplace copy, and onboarding still name the harness — a preset cannot
reach those, and should not try.

Licensed MIT.
