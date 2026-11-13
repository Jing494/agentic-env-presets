# Agentic environment presets

Two agent presets — **exact clones of the shipped Standard and PTC
compositions** — whose system prompt describes a plain *agentic coding
environment* instead of naming the harness. Tools, plan mode, compaction,
delegation, subagents, prompt caching and every config value are copied
verbatim from the shipped declarations. The only composition change is one
extra row, `env-identity`.

This directory is a self-contained, portable recipe: the two patch files, the
tiny prompt-rewriter plugin, a re-runnable verification script, and the
reasoning. It is meant to be read and re-used on another harness/platform, not
just installed here.

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
| [`移植说明.md`](移植说明.md) | Chinese design/pitfall/porting notes |
| [`PROMPT.md`](PROMPT.md) | The original task brief |

## Display language and icon

The two presets' display `name`/`description` are Chinese
(`标准模式（中性环境）` / `PTC 模式（中性环境）`). This is deliberate: the
shipped client translates the display text of **built-in presets only**
(`standard`, `ptc`, `minimal`, `cordis`, and only while their declaration has
no `name`). Custom presets show the declared string verbatim, so there is no
built-in locale switch for them. Making it follow the client language would
require an extra Client plugin that hooks the preset picker — out of scope for
a two-row bundle. The **bundle's own** title/description (shown in Plugin
Manager / Settings) does follow the client language, via the standard
`locale/en.json` + `locale/zh.json` + `./locale/*.json` export.

[`icon.svg`](icon.svg) follows the shipped plugin-art conventions: `36×36`
with `viewBox="0 0 36 36"`, root `fill="none"`, a blue→indigo
`linearGradient` pair named `dsh_plugin_art_R0a/R0b`, rounded rects, and a
white `</>` glyph inside a terminal window. No outer frame or green fill.
It is exported as `./icon` and listed in `files`.

## Why a preset, and not a config flag

The harness's system prompt is an ordered list of named **sections** plus
**runtime-context** entries, assembled per model step by
`@deepseek-ai/dsh-system-prompt`. The brand text is not one string in one
place; it comes from three classes of source:

| Source | What it contributes | Owner package |
|---|---|---|
| `harness:identity` section (order −1000) | `You are an AI agent powered by DeepSeek Harness.` | `dsh-system-prompt`, gated by `includeHarnessIdentity` |
| `harness:source` (section 10000 / context 200) and `app:web-surface` (section 10100 / context 210) | "The runtime context names the DeepSeek Harness implementation checkout…", the Web GUI URL, and a long paragraph about rebuilding the GUI | `dsh-harness-dev-context` |
| Passing prose in framework texts | `Current DSH file policy: …`, `The DSH file sandbox …`, `extend DSH itself` | `dsh-sandbox-policy`, `dsh-harness-dev-context` |

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
  name: '@local/agentic-env-presets'
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
cd /storage/emulated/0/dsh/projects/agentic-env-presets
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
  section.
- **The phrase table is deployment-specific.** Shipped wording is the default;
  a deployment that changed its prompts should edit `config.replacements`.
  The whole model-visible brand inventory on this release is the four phrases
  in `BRAND_TOKENS` / `DEFAULT_REPLACEMENTS` — re-run `verify.mjs` after any
  framework upgrade.
- **Reinstall / reload.** The bundle is linked from the workspace
  (`link:/storage/emulated/0/dsh/projects/agentic-env-presets`), so the Host
  resolves the live `index.js`. Changing JS after installation may still need
  `remove_bundle` → `install_bundle` (or a Host restart) because the Host keeps
  the loaded module generation. Changing only YAML patch files needs the same.

## Installing here

```sh
# via plugin_manager (already done in the current `web` profile):
plugin_manager install_bundle target: /storage/emulated/0/dsh/projects/agentic-env-presets
```

`plugin_manager list_plugins` then shows `preset-standard-env` and
`preset-ptc-env` with `fiberPhase: active`. `dsh --profile web --dump-config`
shows both rows. The two presets appear in the preset picker next to the
shipped ones; pick one when creating a **new** session (existing sessions keep
the preset revision they started with). This bundle is harness-level and has
no mobile-app, desktop-shell, or platform-specific parts.

To update the clones after a DSH upgrade, re-run `node gen-presets.mjs` with
the new `dsh-web-app/presets` directory, diff the result, then reinstall.

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

Verify after any DSH upgrade by diffing again — `diff` output must be exactly
the header, the row id, the metadata block, and the single `env-identity` row:

```sh
diff -u <dsh-install>/node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml \
        presets-standard.patch.yml
```

## Porting to another harness

The pattern generalizes; only the names change:

1. Find where the platform assembles the system prompt and whether it supports
   *namespaced/scoped* section overrides. If it does, shadow the identity and
   the platform-maintenance sections by name — that keeps the rest of the
   prompt, tools, and caching untouched.
2. If it only supports one final string (a single `systemPrompt` field), do the
   same three steps at the terminal hook: replace the identity line, delete
   the maintenance paragraphs, and scrub literal phrases. A `[from, to]` list
   keeps this auditable and reversible.
3. Keep the rewrite *per-agent*, not global: other sessions and other presets
   should keep the original prompt so a maintainer agent can still talk about
   the platform accurately.
4. Never regex-replace brand tokens globally. `DeepSeek Harness`, `DSH_HOME`,
   `dsh` as a CLI name, and socket paths all share substrings; literal phrase
   pairs with an explicit ordering are the safe form.
5. Verify with three cases (clean / clean-with-silencing-off / baseline-still-
   branded), not with "installation succeeded".
