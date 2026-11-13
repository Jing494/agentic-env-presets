# Agentic environment presets

[![npm version](https://img.shields.io/npm/v/dsh-agentic-env-presets.svg)](https://www.npmjs.com/package/dsh-agentic-env-presets)
[![npm downloads](https://img.shields.io/npm/dm/dsh-agentic-env-presets.svg)](https://www.npmjs.com/package/dsh-agentic-env-presets)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.1.7%20→%200.2.x-4D6BFE.svg)](https://github.com/Jing494/agentic-env-presets)

[English](README.md) | [中文](README.zh.md)

Two agent presets — **exact clones of the shipped Standard and PTC
compositions** — whose system prompt describes a plain *agentic coding
environment* instead of naming the harness. Tools, plan mode, compaction,
delegation, subagents, prompt caching and every config value are copied
verbatim from the shipped declarations. The only composition change is one
extra row, `env-identity`.

## Install

Requires a DSH whose prompt API matches this bundle — `0.1.7` through `0.2.x`
(see [Compatibility](#compatibility)). Nothing else is needed: no build step, no
native dependency, no post-install script.

### From the plugin page (GUI)

The Web GUI's plugin manager installs the same three things through one text box
(**Settings → Plugins → install**). Paste any one of these:

| Paste this | Installs | Resolves as |
|---|---|---|
| `dsh-agentic-env-presets` | latest from npm | registry |
| `dsh-agentic-env-presets@1.1.0` | that exact npm version | registry |
| `https://github.com/Jing494/agentic-env-presets` | GitHub default branch | git |
| `github:Jing494/agentic-env-presets` | GitHub default branch | git |
| `/absolute/path/to/agentic-env-presets` | a local checkout | path |

The box asks for the **package name**, a **GitHub repository URL**, or a **local
directory path** — exactly those three shapes. Things that look right but are not
accepted, each confirmed against the installer's own parser:

| Instead of | Reason it fails |
|---|---|
| `https://www.npmjs.com/package/dsh-agentic-env-presets` | the npm **web page** is not a repository URL. The installer reads it as a git host and the clone fails. Paste the bare package name instead. |
| `npm install dsh-agentic-env-presets` / `dsh plugin add …` | a whole command line is not a spec; paste only the part **after** `add`. |
| `Jing494/agentic-env-presets` | not a valid package name, and not a URL — use the full `https://github.com/…` form. |
| `./agentic-env-presets` | a local path must be **absolute**. |

Install scripts are never needed by this bundle, so the plugin page will not ask
you to approve any build step. If a package it does install wants to run one, the
page stops and asks first — that prompt is the gate, not an error.

### From npm (recommended)

```sh
dsh plugin --profile web add dsh-agentic-env-presets
```

Pinned to an exact version, if you would rather control when it moves:

```sh
dsh plugin --profile web add dsh-agentic-env-presets@1.1.0
```

### From GitHub

Tracks the repository's default branch — you get whatever is committed, including
changes that have not been released:

```sh
dsh plugin --profile web add https://github.com/Jing494/agentic-env-presets
# or the shorthand pnpm accepts:
dsh plugin --profile web add github:Jing494/agentic-env-presets
```

### From a local checkout

For editing the presets or the rewriter itself. `link:` keeps the Host pointed at
this working tree, so a change is visible without reinstalling:

```sh
dsh plugin --profile web add link:/path/to/agentic-env-presets
```

### After installing

Both commands register the bundle as a profile layer automatically. `dsh` then
writes it into `$DSH_HOME/profiles/<profile>/package.json` under
`dsh.profile.bundles`; check with:

```sh
dsh --profile web --dump-config | grep -E 'preset-(standard|ptc)-env'
```

Restart the profile, then pick `标准模式（中性环境）` or `PTC 模式（中性环境）`
when creating a **new** session — the picker lists them next to the shipped
presets. Existing sessions keep the preset they started with.

### Verify the install

```sh
dsh --profile web --dump-config | grep -c env-identity   # expect 2
```

If a bundle cannot load, `dsh` prints `skipping profile bundle "<name>": <reason>`
and boots without it — the profile is never taken down by a bad bundle. Re-running
`add` after fixing the cause reinstalls it.

### Uninstall

```sh
dsh plugin --profile web remove dsh-agentic-env-presets
```

This drops the dependency and its `dsh.profile.bundles` entry in one step, so no
stale layer is left behind. Sessions already running on one of these presets keep
it until they restart.

## Deliverables

| File | What it is |
|---|---|
| [`presets-standard.patch.yml`](presets-standard.patch.yml) | Standard clone, preset id `standard-env`, Loader row `preset-standard-env` |
| [`presets-ptc.patch.yml`](presets-ptc.patch.yml) | PTC clone (`run_code`-only executor, workflow / plugin-market tools disabled), preset id `ptc-env` |
| [`index.js`](index.js) | The `env-identity` rewriter plugin (three layers, config-driven phrase table) |
| [`verify.mjs`](verify.mjs) | Reproducible verification against the real shipped plugins |
| [`gen-presets.mjs`](gen-presets.mjs) | Regenerates both patches from the shipped files (fidelity check/upgrade tool) |
| [`package.json`](package.json) | Bundle manifest; `dsh.bundle.patch` lists both patch files |
| [`icon.svg`](icon.svg), [`locale/en.json`](locale/en.json), [`locale/zh.json`](locale/zh.json) | Official-style icon and localized bundle title/description |
| [`docs/DETAIL.md`](docs/DETAIL.md), [`docs/DETAIL.zh.md`](docs/DETAIL.zh.md) | The detail document each language's `meta.detail` points at |
| [`README.zh.md`](README.zh.md) | Chinese README |
| [`移植说明.md`](移植说明.md) | Chinese design/pitfall/porting notes |
| [`PROMPT.md`](PROMPT.md) | The original task brief |

## How the trick works

`includeHarnessIdentity` is a **deployment-level** switch, and an agent preset
cannot mount the prompt registry itself — so no preset can turn it off. What a
preset *can* do is contribute sections in its own scope, and the registry's
scoped layers are keyed by section name: `ScopedLayers.merge()` lets a scoped
section **shadow** a global one of the same name, farthest-ancestor-first, and
`dsh-agent-presets` chains the agent scope to its preset's standing scope with
`bindScopeParent(agentKey, presetKey)`. That is the whole trick:

```
global layer        harness:identity, tool guidance, harness:source, app:web-surface, …
        ▲ shadowed by
preset layer        harness:identity (new text), harness:source = "", app:web-surface = ""
        ▲ inherited by
agent scope         (per-session additions)
```

The empty shadows still exist as assembly entries, but `renderPrompt` drops
empty sections and empty contexts disappear from the joined snapshot. The
global owner stays mounted for every other preset.

## What the plugin does (`index.js`)

It is a plain Cordis function plugin (`name`, `inject`, `apply`) with no
runtime dependencies, mounted as one row inside each preset. Three layers, in
the priority order the task brief asks for:

1. **Replace the identity.** Register `harness:identity` in the preset scope
   with `config.identity`. Same name ⇒ the global one is replaced, not
   duplicated.
2. **Silence harness-maintenance context.** When `silenceDevContext` (default
   `true`), register `harness:source` and `app:web-surface` — both the section
   and the runtime-context halves, four names total — with empty text. This is
   what removes the checkout path and GUI URL, without unmounting their owner.
3. **Scrub leftover tokens.** A scope-filtered `system-prompt/assemble`
   waterfall listener rewrites every assembled section and context with
   literal `[from, to]` phrase pairs from `config.replacements`. Literal
   `split/join`, never regex, so `$DSH_HOME`, `DSH_ENV_PREFIX`, the `dsh` CLI
   name (`only dsh web injects …`) and socket paths are never mangled. The
   space-suffixed `DeepSeek Harness ` pair runs first so "the DeepSeek Harness
   implementation checkout" becomes "the implementation checkout" instead of
   "the the …". `extend DSH itself` gets its own phrase pair because it is a
   self-reference, not an identifier.

The listener returns **copies** of the section/context entries. Assemblies are
shared with the registry until the waterfall returns, and mutating them in
place would leak into other agents' later requests.

Deliberately **not** done: no global patch to framework prompt strings; no
`complete: true` section (that would swallow tool guidance, plan mode and the
SDK docs and break prompt caching); no regex replacement.

### Config

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

The manifest declares **no `engines.dsh`** on purpose. A narrow range such as
`^0.2.2-rc.1` covers only `0.2.2`–`0.2.5`, so the bundle would be **rejected
outright** the moment the engine moves past that window — exactly the failure
mode where upgrading the engine forces upgrading the plugin first. Instead:

- `peerDependencies` declares `@deepseek-ai/dsh-system-prompt": ">=0.1.0-0"`,
  which `semver` matches with `includePrerelease`, so prerelease engines count.
- The sections the plugin touches (`harness:identity`, `harness:source`,
  `app:web-surface`) and the prompt API it calls (`getSectionOrder`,
  `getContextOrder`, `system-prompt/assemble`) exist from `0.1.7` through
  `0.2.x`, which is what the range is anchored on.

If a future engine renames those sections, the bundle is **skipped at startup**
with a diagnostic naming the missing piece, and the profile still boots — a bad
bundle never takes the harness down with it.

## Verification

`verify.mjs` mounts the **real** `dsh-system-prompt`,
`dsh-harness-dev-context` and `dsh-persona` packages, plus a faithful stub of
the `dsh-sandbox-policy` runtime context and the two Host services
`dsh-harness-dev-context` injects (`webApp`, `sessionProjections`). It opens a
preset scope, chains an agent scope beneath it, assembles and renders, and
asserts with exact substring checks:

| Case | Assertion |
|---|---|
| env preset, default config | identity is the new text; maintenance sections/contexts are empty; **no brand phrase** in prompt or context; no doubled "the the" |
| env preset, `silenceDevContext: false` | maintenance paragraphs stay (that is what disabling silence means), but the **scrub layer still removes every brand phrase**, no "the the" |
| baseline preset (no env row) | brand phrases **still present** — proving no leak into the global/deployment layer |

Run it from anywhere (it locates the dsh installation itself, and uses
absolute-path ESM imports because `NODE_PATH` is ignored by ESM and this
filesystem disallows symlinks):

```sh
node verify.mjs                      # or: node verify.mjs <path-to-dsh-installation>
echo $?                              # 0 = all pass, 1 = failure
```

Actual output on this machine (three cases, all `PASS`):

```
===== env preset (default config) =====
--- prompt ---
You are an AI coding agent working inside an agentic coding environment.

You are a coding agent powered by the deepseek-v4.1-flash model.
--- runtime context snapshot ---
Current runtime context. This snapshot supersedes earlier runtime-context snapshots.

Current file policy: danger-full-access. The file sandbox does not restrict file modifications by available operations.
brand tokens found: none
brand=ok identity=ok maintenance=ok noDoubledWord=ok
ASSERTION: PASS

===== env preset (silenceDevContext: false) =====
… "The runtime context names the implementation checkout. … extend the environment itself."
… "Current implementation checkout: …" / "Current Web GUI URL: …"
brand tokens found: none
brand=ok identity=ok maintenance=ok noDoubledWord=ok
ASSERTION: PASS

===== baseline preset (no env row) =====
You are an AI agent powered by DeepSeek Harness.
… The runtime context names the DeepSeek Harness implementation checkout …
brand tokens found: DeepSeek Harness, DSH file policy, DSH file sandbox, extend DSH itself
brand=ok identity=ok maintenance=ok noDoubledWord=ok
ASSERTION: PASS

ALL 3 CASES PASS
```

## Limitations / what this cannot change

- **This changes the model-facing text, not the product.** The Web GUI, the
  CLI help (`dsh --help`), the plugin manager, the marketplace copy, and the
  onboarding text still name the harness. A preset cannot reach any of them,
  and should not try.
- **It is per-agent, by construction.** Other presets, other sessions, and the
  deployment layer keep the original prompt, so an agent that maintains the
  harness can still describe it accurately. If the brand text ever disappears
  from a *baseline* preset, the shadowing leaked — that is exactly what case 3
  checks.
- **Empty-shadowed sections still exist.** They render to nothing, but
  `SystemPrompt.assemble()` lists them; a tool inspecting the raw assembly sees
  two empty entries. Intentional and harmless.
- **It is harness-shaped.** It relies on `ScopedLayers` shadowing by section
  name, `system-prompt/assemble` being a scope-filtered waterfall, and the
  preset→agent scope chain. On a platform without those seams, see the porting
  section in [`移植说明.md`](移植说明.md).
- **The phrase table is deployment-specific.** Shipped wording is the default;
  a deployment that changed its prompts should edit `config.replacements`.
  The whole model-visible brand inventory on this release is the five phrases
  in `BRAND_TOKENS` / `DEFAULT_REPLACEMENTS` — re-run `verify.mjs` after any
  framework upgrade.

## Upgrading the clones

Both patches are verbatim clones. After a DSH upgrade, regenerate and diff:

```sh
node gen-presets.mjs <dsh-install>/node_modules/@deepseek-ai/dsh-web-app/presets
diff -u <shipped>/standard.patch.yml presets-standard.patch.yml
```

The diff must be exactly the header, the row id, the metadata block, and the
single `env-identity` row.

### Changelog

**2026-11-11 — re-cloned against DSH `0.2.2-rc.1` (fixes a broken row).**

Both files had drifted from the shipped declarations. The visible symptom was

```
tool-subagent-list-agents (@deepseek-ai/dsh-tool-subagent-control/list-agents): never started
```

reported by `@deepseek-ai/dsh-agent-preset-registry` while mounting
`standard-env` / `ptc-env`. The row imported
`@deepseek-ai/dsh-tool-subagent-control/list-agents`, but that package's
`exports` map has **no `./list-agents` subpath** — `list_agents` is registered
by its main entry (`apply()` calls `registerListAgents(ctx)`). The import could
therefore only fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`, the Loader logged the
import error and left `entry.fiber` undefined, and the audit rendered it as
"never started". The shipped `standard`/`ptc` presets never declare such a row.

Fixed by regenerating both files verbatim from the 0.2.2-rc.1 declarations, so
the row is gone. The same regeneration also restored three drift items that had
silently changed behavior:

| Row | Before | After (matches shipped) |
|---|---|---|
| `tool-fs` | no `config` (applyPatch defaulted off, but the comment was gone) | `applyPatch: false` |
| `tool-subagent` | `modelSelectionSettings: true` (not a config key) | `modelSelection: true` + `modelDiscovery: true` |
| `tool-executor-ptc` (ptc only) | `@deepseek-ai/dsh-agent-tool-presentation` (`mode: ptc`) | `@deepseek-ai/dsh-tool-executor-ptc` |

**2026-11-13 — publishable manifest.** Renamed to the unscoped
`dsh-agentic-env-presets`, dropped `private`, added `license: MIT`,
`repository`, `icon`, `keywords`, `main`, and the locale `meta.detail` docs;
wide `peerDependencies` replaces any `engines.dsh` pin (see Compatibility).

## License

[MIT](LICENSE) © 2026 Jing494
