# AGENTS.md

## Tooling

* Use the Node version declared by `.nvmrc` / Volta and run package commands from the repository root.
* Use npm. For clean installs, use `npm ci`.
* When changing dependencies, update both `package.json` and `package-lock.json`. Preserve dependency `overrides` unless their removal or change is justified by the
  dependency/security change.

## Repository layout

* `lib/` — runtime implementation.
* `cli/` — CLI behavior.
* `test/unit/` and `test/functional/` — Jest tests. Mirror source paths where practical.

## Validation

* Run the directly affected Jest test first when possible:
  `npx jest test/unit/path/to/file.test.ts --runInBand --config jest.config.ts`
* For code changes, run `npm run build`, `npm run lint`, and the relevant tests.
* Run `npm test` before completing changes that affect multiple modules or test areas, shared client/server behavior, configuration loading, or protocol behavior.
* For `client-templates/**/*.json.sample` changes, also run `./lintVerifier.sh`.
* For `defaultFilters/` changes, run the relevant filter-loading and behavior tests and review affected snapshots intentionally.
* `npm run test:bin` is Linux-oriented. On macOS, use `npm run test:bin:docker`; note that its interactive Docker invocation may not work in non-TTY automation.

## Tests

* Write new Jest unit and functional tests in TypeScript.
* Functional tests should use the shared setup helpers.
* Clean up clients, servers, timers, mocks, and modified environment state.
* Local configuration loading may read the root `.env`; account for this when investigating local-only test behavior. Never overwrite or delete a user's local `.env`.

## Security-sensitive changes

* Treat filters, credential handling, URL rewriting, and logging as security-sensitive.
* For filter changes, inspect both `client-templates/` and `defaultFilters/`; do not assume corresponding files are identical.
* Test relevant denial/redaction behavior as well as the intended allowed behavior.
* Preserve the tracked `client-templates/github -> ./github-com` symlink.

## Generated and local files

* Do not edit generated output such as `dist/`, `reports/`, caches, `binary-releases/`, `dockerfiles/**/metadata.json`, or `dockerfiles/**/package.json`.
* Update tracked lockfiles and Jest snapshots through their owning tools and review the resulting diff.
* Never commit local `.env`, `accept.json`, `config.universal.json`, or `config.universaldev.json`.
* Do not confuse those ignored local files with tracked files such as `config.universal.json.sample` and `config.universaltest*.json`, which may legitimately need changes.

See `test/README.md` for testing guidance. See `.github/CONTRIBUTING.md` for commit-message and PR conventions.
