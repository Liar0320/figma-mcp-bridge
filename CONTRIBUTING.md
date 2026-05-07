# Contributing

Thanks for contributing to Figma MCP Bridge. This repository uses Conventional Commits so GitHub Releases can be generated automatically from commit history.

## Conventional Commits

Use this format for commits and PR titles when possible:

```text
<type>(<scope>): <summary>
```

Examples:

```text
feat(server): add create_design_tokens MCP tool
feat(plugin): support token creation dry-run planner
fix(plugin): use async text style APIs in dynamic-page mode
fix(server): route direct rename_node requests correctly
docs(tokens): document token usage audit workflow
test(plugin): cover Unicode token path normalization
ci(release): run semantic-release on main
```

Recommended scopes:

- `server` — MCP server, schemas, bridge, leader/follower routing, CLI entry point
- `plugin` — Figma plugin runtime, serializer, UI, write executor
- `tokens` — design-token graph, usage, audit, proposal, creation, application, export behavior
- `docs` — README, contributor docs, usage guides
- `test` — test coverage and test harness changes
- `ci` — GitHub Actions and validation automation
- `release` — semantic-release configuration and release process changes

Common types:

- `feat` — user-facing feature or new capability
- `fix` — bug fix
- `docs` — documentation-only change
- `test` — tests-only change
- `ci` — CI/release automation change
- `chore` — maintenance that does not affect runtime behavior
- `refactor` — internal restructuring without behavior changes

## Version impact

semantic-release uses commit messages to decide the next version:

- `fix(...)` -> patch release
- `feat(...)` -> minor release
- `feat!` or a `BREAKING CHANGE:` footer -> major release

Use a breaking-change marker when a change affects consumers in incompatible ways. Examples include:

- MCP tool input parameter changes
- MCP tool response schema changes
- token path normalization changes
- server/plugin protocol changes
- write or mutation behavior changes that affect callers

Breaking-change examples:

```text
feat(server)!: rename token usage summary fields

BREAKING CHANGE: get_token_usage now returns coverage under summary.coverage instead of coverage.
```

```text
fix(tokens): preserve Unicode token path segments

BREAKING CHANGE: normalized token paths for non-ASCII variable names now preserve Unicode letters instead of ASCII slugifying them.
```

## Release automation

This repository uses semantic-release for repository-level GitHub Releases and git tags.

The initial release automation intentionally does **not** publish to npm. Do not add `@semantic-release/npm` or npm publishing credentials unless the package/distribution model is explicitly designed in a follow-up issue.

The release workflow runs on `main` and uses the existing git tags to calculate the next version. This repository already has a `v1.0.0` baseline tag. For a fresh repository or a repository without a reliable previous release tag, create or document a baseline tag before enabling semantic-release so historical commits do not pollute the first generated release.

## Dry-run validation

To validate release configuration locally:

```bash
npm ci
GITHUB_TOKEN=<token> npm run release:dry-run -- --no-ci
```

The GitHub token must have enough permission to read the repository and verify GitHub release publishing. A local dry run may stop at GitHub authentication or permission checks if no token is provided.

You can also run a dry run from GitHub Actions by manually dispatching the `Release` workflow with `dry_run` set to `true`.

## Local validation before PR

Run the relevant checks before opening a PR:

```bash
cd server
npm install
npm run build
npm test

cd ../plugin
npm install
npm run build
npm test
```

For release automation changes, also run from the repository root:

```bash
npm ci
npm run release:dry-run -- --no-ci
```
