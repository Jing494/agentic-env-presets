# Publishing this as a DSH plugin

Everything a repository has to do to be installable, discoverable, and listed by
DSH's plugin marketplaces. Each requirement below is either enforced by the DSH
runtime (it literally will not install) or read by a directory that indexes
plugins — the distinction matters, so it is called out per row.

## What DSH itself requires

These are hard requirements: the runtime or pnpm enforces them, and a missing
piece either fails the install or makes the bundle get skipped at startup.

| Requirement | Where | Why it is enforced |
|---|---|---|
| `dsh.bundle.patch` names the patch files | `package.json` | `loadProfileDirectory` throws `profile bundle "<name>" declares no dsh.bundle` without it; the package would install as a plain dependency and never act as a layer |
| Those patch files exist in the package | tarball | a missing file makes the bundle be **skipped at startup** with a diagnostic, not a crash |
| Package name resolves from the profile | `node_modules` | the preset's `env-identity` row names this package (`name: 'dsh-agentic-env-presets'`), so the installed package's own name must match the row |
| `license` present | `package.json` | npm refuses to publish without it (HTTP 422) |
| `private` absent | `package.json` | npm refuses to publish with it set |
| Version compatible with the running engine | `engines.dsh` or `@deepseek-ai/dsh*` peers | the runtime evaluates this before mounting. This bundle declares **no `engines.dsh`** and a wide peer (`>=0.1.0-0`) so it is not rejected when the engine moves (see [Compatibility](../README.md#compatibility)) |
| No install script needed | `package.json` | this bundle has none, so nothing asks for build approval |

Nothing here requires a build step, a lockfile, or a `prepare` script: the
published JavaScript is what runs.

## What makes a repository discoverable

DSH's own built-in market reads the **community registry**; third-party
directories additionally sync the [`dsh-plugin` GitHub topic][topic]. Adding the
topic is the one action an author can take alone, with no review.

[topic]: https://github.com/topics/dsh-plugin

| Item | State in this repo | Notes |
|---|---|---|
| `dsh-plugin` topic | set | what directories scrape; no application, no review |
| Repository description | set, includes the install command | directories show it as the summary when they have none of their own |
| `homepage` | points at the npm page | read from the GitHub API on sync |
| `license` | MIT | shown on every card |
| `keywords` in `package.json` | `dsh`, `dsh-plugin`, `dsh-bundle`, … | used by registry search |
| Published to npm | yes | npm-published plugins install from a tarball, which is faster and more reproducible than a clone |
| Repository is public | yes | |

## Checklist for a new release

```sh
# 1. the manifest stays publishable
node -e 'const p=require("./package.json");
  if(p.private) throw "private:true";
  if(!p.license) throw "no license";
  if(!p.dsh?.bundle?.patch) throw "no bundle patch";'

# 2. nothing declared in `files` is missing from the tarball
npm pack --dry-run --json | node -e '...'   # the publish workflow does this

# 3. the presets still work against the real plugins
node verify.mjs

# 4. publish by tagging — the workflow publishes to npm over OIDC
npm version patch && git push --follow-tags
```

`.github/workflows/publish.yml` automates steps 1, 2 and 4: it refuses to publish
when the tag and `package.json` disagree, when the manifest is unpublishable,
when a named file is missing from the tarball, or when the version is already on
the registry.

## Verify an install the way a user would

```sh
dsh plugin --profile verify-check add dsh-agentic-env-presets
dsh --profile verify-check --dump-config | grep -c env-identity   # expect 2
dsh --profile verify-check remove dsh-agentic-env-presets
```

A bundle that fails to load prints `skipping profile bundle "<name>": <reason>`
and the profile still boots — a bad bundle never takes the harness down, which is
why the install check above is about the *layer composing*, not about the command
exiting zero.

## Risk flags directories look for

Third-party catalogues flag what a package can reach, so it is worth knowing what
this one does and does not do:

| Flag | This bundle |
|---|---|
| Install script | none — nothing runs at install time |
| Terminal surface | none — it does not execute shell commands |
| Requires credentials | none — it does not ask for an API key or token |

Its only effect is on the system prompt of the two presets it declares.

## What this cannot do

A listing is not a security review, and being indexed is not an endorsement. Nor
does publishing itself reach DSH's built-in market: that one is fed by a curated
community registry with its own review, so appearing there is a separate,
externally-owned step rather than something this repository can configure.
