# AGENTS.md

This file gives AI coding agents repository-specific contribution rules for Figma MCP Bridge.

## Commit and PR messages

Use Conventional Commits for commits and PR titles whenever possible:

```text
<type>(<scope>): <summary>
```

Recommended scopes:

- `server` — MCP server, schemas, bridge, leader/follower routing, CLI entry point
- `plugin` — Figma plugin runtime, serializer, UI, write executor
- `tokens` — design-token graph, usage, audit, proposal, creation, application, export behavior
- `docs` — README, contributor docs, usage guides
- `test` — test coverage and test harness changes
- `ci` — GitHub Actions and validation automation
- `release` — semantic-release configuration and release process changes

Do not use vague commit messages such as:

- `update`
- `fix bug`
- `wip`
- `changes`

Prefer precise messages such as:

```text
fix(plugin): use async text style APIs in dynamic-page mode
feat(server): add create_instance MCP tool
ci(release): add semantic-release github automation
docs(tokens): document token audit workflow
```

## Breaking changes

Mark breaking changes with `!` after the type/scope or with a `BREAKING CHANGE:` footer.

Agents must mark breaking changes when modifying behavior that consumers may depend on, including:

- MCP tool input schemas
- MCP tool response shapes
- token path normalization
- server/plugin protocol messages
- write or mutation behavior
- multi-file routing semantics

Examples:

```text
feat(server)!: require fileKey when multiple files are connected
```

```text
fix(tokens): preserve Unicode token path segments

BREAKING CHANGE: token paths for non-ASCII variable names now preserve Unicode instead of ASCII slugifying them.
```

## Validation before PR

Before opening a PR, run the checks relevant to touched code. For broad repository changes, run:

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

If a check cannot be run locally, state why in the PR body.

## Release automation guardrail

Issue #25 only enables GitHub Releases and git tags through semantic-release. Do not add npm publishing, `@semantic-release/npm`, package registry credentials, Changesets, or independent server/plugin versioning unless a follow-up issue explicitly asks for it.
