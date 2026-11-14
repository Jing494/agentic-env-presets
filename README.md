# Agentic environment presets

[![npm version](https://img.shields.io/npm/v/dsh-agentic-env-presets.svg)](https://www.npmjs.com/package/dsh-agentic-env-presets)
[![npm downloads](https://img.shields.io/npm/dm/dsh-agentic-env-presets.svg)](https://www.npmjs.com/package/dsh-agentic-env-presets)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.1.7%20→%200.2.x-4D6BFE.svg)](https://github.com/Jing494/agentic-env-presets)

[English](README.md) | [中文](README.zh.md)

Two agent presets — **exact clones of the shipped Standard and PTC
compositions** — whose model-facing text describes a plain *agentic coding
environment* instead of naming the harness. Tools, plan mode, compaction,
delegation, subagents, prompt caching and every config value are copied
verbatim from the shipped declarations. The only composition change is one
extra row, `env-identity`.

"Model-facing" is wider than the system prompt: it also covers the **runtime
context snapshot**, **tool schema descriptions**, and the **skill catalog
message** injected every step. Those four kinds of text belong to four
different subsystems, which is why the plugin has five layers instead of one —
see [How the trick works](#how-the-trick-works).

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
| [`index.js`](index.js) | The `env-identity` rewriter plugin (five layers, config-driven phrase table and three switches) |
| [`verify.mjs`](verify.mjs) | Reproducible 18-case verification against the real shipped plugins, plus mutation-test instructions |
| [`probe-restrict.mjs`](probe-restrict.mjs) | Proves a tool shadow does **not** bypass a subagent's `tools.restrict()` |
| [`probe-robust.mjs`](probe-robust.mjs) | Proves missing services/fields degrade to a no-op instead of throwing (with a control case) |
| [`gen-presets.mjs`](gen-presets.mjs) | Regenerates both patches from the shipped files (fidelity check/upgrade tool) |
| [`package.json`](package.json) | Bundle manifest; `dsh.bundle.patch` lists both patch files |
| [`icon.svg`](icon.svg), [`locale/en.json`](locale/en.json), [`locale/zh.json`](locale/zh.json) | Official-style icon and localized bundle title/description |
| [`docs/DETAIL.md`](docs/DETAIL.md), [`docs/DETAIL.zh.md`](docs/DETAIL.zh.md) | The detail document each language's `meta.detail` points at |
| [`docs/PUBLISHING.md`](docs/PUBLISHING.md), [`docs/PUBLISHING.zh.md`](docs/PUBLISHING.zh.md) | Repository requirements for publishing and being indexed as a DSH plugin |
| [`LICENSE`](LICENSE) | MIT |
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
global layer        harness:identity, tool guidance, harness:source,
                    app:web-surface, sandbox:policy, every tool …
        ▲ shadowed by
preset layer        harness:identity (new text), harness:source = "",
                    app:web-surface = "", sandbox:policy = delegating wrapper,
                    each tool = same name, scrubbed description
        ▲ inherited by
agent scope         (per-session additions)
```

The empty shadows still exist as assembly entries, but `renderPrompt` drops
empty sections and empty contexts disappear from the joined snapshot. The
global owner stays mounted for every other preset.

### Brand text lives in **five** places, not one

This was 1.1.1's core blind spot: it covered only the two prompt sections, so a
real session still introduced itself with the brand name.

| Surface | Owner | Seam |
|---|---|---|
| System-prompt sections | `dsh-system-prompt` | same-name `section()` |
| Runtime-context entries | each owner; **re-resolved after assembly** | same-name `context()`, delegating wrapper |
| Tool schema descriptions | `dsh-tools` | same-name `tools.register()`, forwarding the executables |
| Loop-injected user messages (skill catalog) | `dsh-tool-skill` and friends | `agent/pre-step`, and it **must** be `{prepend:true}` |
| Everything left over | anyone | `system-prompt/assemble` waterfall |

Two of these are counter-intuitive enough to spell out:

- **Runtime context is re-resolved *after* the waterfall.** `dsh-agent-loop`
  runs `assemble()` → waterfall → `refreshContext()` → render, and
  `refreshContext()` re-resolves every context provider. A waterfall-only scrub
  therefore looks perfect in a unit test and leaks in the real request. This
  package shadows each context with a delegating wrapper instead, so the
  re-resolution lands on our function.
- **The skill catalog is appended *after* `next()`.** So the `agent/pre-step`
  listener must be **outermost** (`{prepend:true}`); a default (inner)
  registration has already finished scanning an empty decision by the time the
  catalog — brand text and all — is appended. `verify.mjs` pins this with a
  dedicated case.

## What the plugin does (`index.js`)

It is a plain Cordis function plugin (`name`, `inject`, `apply`) with no
runtime dependencies, mounted as one row inside each preset. Five layers:

1. **Replace the identity.** Register `harness:identity` in the preset scope
   with `config.identity`. Same name ⇒ the global one is replaced, not
   duplicated.
2. **Silence harness-maintenance context.** When `silenceDevContext` (default
   `true`), register `harness:source` and `app:web-surface` — both the section
   and the runtime-context halves, four names total — with empty text. This is
   what removes the checkout path and GUI URL, without unmounting their owner.
3. **Shadow the runtime contexts.** Every global context is re-registered under
   its own name with a function `text` that calls the original provider and
   scrubs the result, so `refreshContext()` resolves the scrubbed version while
   the working directory, file policy and approval policy all survive.
4. **Shadow tool descriptions.** Every branded tool is re-registered under its
   own name with all three documentation surfaces rewritten: the top-level
   `description`, every nested `description`/`title` inside `parameters`, and
   the same fields inside `output.schema`. `enum`, `const`, `default`, `$ref`
   and property NAMES are data or identifiers and stay byte-identical, as do
   `execute`, `render` and `when`. PTC mode inlines all three surfaces into its
   `tools:sdk` prompt section, so both executors are covered by the one fix.
   The reserved `run_code` name is skipped. A shadow does **not** bypass a
   subagent's `tools.restrict()`: a preset layer is an inherited layer and still
   has to pass `admits()`.
5. **Rewrite a `complete: true` prompt.** Such a section is restored by
   `assemble()` **after** the waterfall, from the pre-waterfall snapshot, as the
   **entire** prompt — none of the four layers above can reach it. In an
   ancestor layer a same-name re-registration (keeping `complete`) works; in
   **this preset's own** layer that re-registration must throw, so the section
   object is rewritten **in place** (after checking that it is neither frozen
   nor shared between layers, and restored on unload). The shipped `minimal`
   preset sets `complete: true`, so this is a real path, not a hypothetical one.
6. **Scrub what is left.** A scope-filtered `system-prompt/assemble` waterfall
   listener as a last resort, plus an outermost `agent/pre-step` listener that
   rewrites the injected **skill catalog and skill bodies** (`skill-catalog`,
   `skill-invocation`, …) while excluding the caller's own messages by id.

Layer 6's phrase table is literal `split/join` and **order matters** (longest
first): the space-suffixed `DeepSeek Harness ` pair runs before the bare one, so
"the DeepSeek Harness implementation checkout" becomes "the implementation
checkout" instead of "the the …".

A bare `DSH` left in prose is caught by a **narrow regex with three
assertions**, `(?<![\w$.\-])DSH(?![\w\-])`. That reverses 1.1.1's "never
regex" rule, because a pure phrase table always lags whatever a plugin author
writes next. A substitution at the head of a sentence is capitalised
(`DSH rules apply` becomes `The … rules apply`), while **CJK context gets no
English article** (`DSH 的规则` never becomes `The … 的规则`). The assertions keep
these byte-identical:

```
$DSH_HOME   DSH_ENV_PREFIX   __DSH_BOOT__   engines.dsh
@deepseek-ai/dsh-tool-bash   DSH-1234   myDSHThing
```

The listener returns **copies** of the section/context entries. Assemblies are
shared with the registry until the waterfall returns, and mutating them in
place would leak into other agents' later requests.

Deliberately **not** done: no global patch to framework prompt strings; no
`complete: true` section (that would swallow tool guidance, plan mode and the
SDK docs and break prompt caching); no renaming of tools (that is the call
surface — a rename breaks tool dispatch outright); no touching `$DSH_*`
identifiers.

### Config

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

The three switches exist for **diagnosis and porting**, not daily use: when one
layer is suspected of over-reaching, switching layers off one at a time
localizes it. `bareToken: false` restores the old literal-phrase-only behavior.

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
`dsh-harness-dev-context`, `dsh-persona`, `dsh-tools`,
`dsh-tool-executor-native`, `dsh-agent` and `dsh-scope` packages, plus the two
Host services `dsh-harness-dev-context` injects (`webApp`,
`sessionProjections`). It opens a preset scope, chains an agent scope beneath
it, then follows the loop's **real order** — assemble, refresh, render, resolve
tools, run the pre-step chain — and asserts with exact substring checks. Nine
cases:

| Case | Assertion |
|---|---|
| 1 default config | identity is the new text; maintenance sections/contexts are empty; **no brand text on any of the four surfaces**; no doubled "the the" |
| 2 `silenceDevContext: false` | maintenance paragraphs stay (that is what disabling silence means), but the scrub still removes every brand phrase |
| 3 baseline preset (no env row) | brand text is **still present** — proving nothing leaked into the global/deployment layer |
| 4 after `refreshContext()` | the loop re-resolves contexts **after** the waterfall; the result must still be clean, and the file-policy text must not have been emptied |
| 5 tool schemas | top-level descriptions **and nested `parameters` documentation** scrubbed; identifiers byte-identical; `enum`/`default`/property names (data) preserved; the baseline tool description still original |
| 6 skill catalog | the catalog message is **actually rewritten** (not merely skipped), and `source.entries` is unpolluted |
| 7 identifier safety | `$DSH_HOME`, `__DSH_BOOT__`, `engines.dsh`, `DSH-1234` and friends survive verbatim |
| 8 mount-order independence | the same plugins in **two different mount orders** must both be clean — the shadow scan was once aborted by its own empty shadows and leaked in only one order |
| 5b PTC `tools:sdk` render | Renders the shadowed definition through the **real `renderToolsSdkPy()`**: prose must be clean and the `enum` data (`Literal["DSH", …]`) must survive |
| 9 `complete: true` in either layer | In an **ancestor** layer a same-name shadow works; in **this preset's own** layer (a sibling `dsh-persona` row) re-registration must throw, so the section object is rewritten **in place**. Neither placement may leak, and a fixed placement must not warn |
| 10 Readable wording | Sentence-initial substitution is capitalised, mid-sentence stays lowercase, CJK context gets **no** English article, and identifiers are byte-identical |

It runs from any directory (it locates the dsh installation itself and imports
by absolute path, because ESM does not honor `NODE_PATH` and this filesystem
disallows symlinks):

```sh
node verify.mjs                      # or: node verify.mjs <dsh-install>
echo $?                              # 0 = all pass, 1 = failure
```

Each case prints the exact text that surface would send to the model, so the
result can be eyeballed as well as asserted.

### Always run the mutation tests

A suite that always passes is not a suite. Run at least these two; **both must
FAIL**:

```sh
# drop prepend: the skill-catalog case (6) must fail
sed -i "s/onPreStep, { prepend: true }/onPreStep/" index.js && node verify.mjs

# disable the context shadow: the refresh case (4) must fail
sed -i "s/^    rescanContexts();/    \/\/ rescanContexts();/" index.js && node verify.mjs

git checkout index.js    # restore
```

Both were run against 1.2.0: they hit cases 6 and 4 respectively, with every
other case still passing.

Two more probes cover the "do not break the harness" side; exit code 0 means
pass:

```sh
node probe-restrict.mjs   # a shadow does not resurrect a tools.restrict()-denied tool
node probe-robust.mjs     # no tools service / no layers / empty config / a throwing provider
```

The last case in `probe-robust.mjs` is a **control experiment**: when a context
provider throws on its own, it throws with the plugin absent too. The assertion
is "identical with and without the preset", not "never throws".
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
  name, `system-prompt/assemble` being a scope-filtered waterfall,
  `refreshContext()` reading the registry, the `agent/pre-step` waterfall order,
  and the preset→agent scope chain. On a platform without those seams, see the
  porting section in [`移植说明.md`](移植说明.md).
- ~~Tool *parameter* descriptions are not scrubbed~~: **fixed in 1.2.0**. Nested
  `description`/`title` fields are now rewritten recursively, while
  `enum`/`const`/`default`/`$ref` and property names are left alone — those are
  data or identifiers, and changing them would break argument construction.
- ~~Skill bodies are not scrubbed~~: **fixed in 1.2.0**. `skill-invocation` is
  appended by the same `agent/pre-step` hook as the catalog, so the body is
  scrubbed too (see `verify.mjs` case 6).
- ~~A `complete: true` prompt takeover~~: **fixed in 1.2.0.** An ancestor-layer
  section is shadowed by name; a same-layer one has its registry entry rewritten
  in place (case 9). Only a frozen or cross-layer-shared object falls back to a
  warning instead of a fix, and that is logged loudly rather than silently.
- **Skill NAMES** (e.g. `dsh-plugin-store`) and the on-disk `SKILL.md` files are
  untouched. The name is the call surface — renaming it breaks `skill()`. The
  file itself lives outside the prompt layer; this package scrubs it only as it
  enters the model context.
- **The phrase table is deployment-specific.** Shipped wording is the default;
  a deployment that changed its prompts should edit `config.replacements`. A
  bare `DSH` in prose is caught by the guarded regex; add new brand terms to the
  table. Re-run `verify.mjs` — and one mutation test — after any framework
  upgrade.

## Upgrading the clones

Both patches are verbatim clones. After a DSH upgrade, regenerate and diff:

```sh
node gen-presets.mjs <dsh-install>/node_modules/@deepseek-ai/dsh-web-app/presets
diff -u <shipped>/standard.patch.yml presets-standard.patch.yml
```

The diff must be exactly the header, the row id, the metadata block, and the
single `env-identity` row.

### Changelog

**2026-11-14 — 1.2.0: the scrub now reaches what the model actually reads.**

A session running the `standard-env` preset still introduced itself as
"running inside DSH (DeepSeek Harness)". Pulling that request out of the
session log showed the leak came from **three surfaces 1.1.1 never touched**:

| Surface | Observed |
|---|---|
| Runtime context | `Current DSH file policy: … the DSH file sandbox …` |
| Tool schema descriptions | 11 occurrences, e.g. `Search the DSH Marketplace catalogue of DeepSeek Harness plugins` |
| Skill-catalog user message | 3 occurrences, `Find and install DeepSeek Harness (DSH) plugins` |

And the runtime context it *thought* it covered was only covered at the instant
`assemble()` runs: `dsh-agent-loop` calls `refreshContext()` after the
waterfall, re-resolving every provider and putting the original sentence back.
The old `verify.mjs` asserted on `assemble()`'s output, which is why all three
of its cases passed.

Fixes and hardening:

- **Delegating context shadows**, so `refreshContext()` resolves a scrubbed
  function instead of the original provider.
- **Tool shadowing** (forwarding `execute`/`output`/`when`), which also fixes
  PTC mode inlining the same descriptions into `tools:sdk`.
- **Skill-catalog scrubbing**, registered `{prepend:true}` so it runs outermost
  — the catalog is appended after `next()`, so a default inner registration
  would silently do nothing.
- Bare `DSH` now falls to a guarded narrow regex; identifiers such as
  `$DSH_HOME` stay byte-identical.
- `verify.mjs` grew from 3 cases to 7, each pinning one of the paths above,
  with mutation tests proving they can actually fail.

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

**2026-11-14 (same day, after the compatibility audit) — two more real gaps closed; 9 cases.**

Auditing upgrade cost and cross-version compatibility surfaced two more surfaces:

| Gap | Symptom |
|---|---|
| Documentation inside `output.schema` | `dsh-tools` never shows it to the model, but PTC's `renderSdk()` renders it into `tools:sdk`, where nested `description` becomes a `#` comment |
| Skill **bodies** | `skill-invocation` is appended by the same `agent/pre-step` hook as the catalog; only the catalog was being scrubbed |

Also measured: 0.1.7-rc.2 and 0.2.2-rc.3 both work in either direction, and
`gen-presets.mjs` absorbs every shipped-preset change automatically (3 of them
between rc.1 and rc.3). The suite grew to 9 cases, with case 5b asserting on the
output of the **real `renderToolsSdkPy()`** while keeping `enum` data intact.

## License

[MIT](LICENSE) © 2026 Jing494
