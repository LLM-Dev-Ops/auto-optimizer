# ADR-0001: Substantiate Completeness Claims and Lock Dependencies

**Status:** Proposed
**Date:** 2026-07-27
**Deciders:** Auto Optimizer Maintainers
**Implements:** [ADR-013: README Claim Substantiation](../../../agentics-enforcement/plans/adr/ADR-013-readme-claim-substantiation.md) (agentics-enforcement)

---

## Context

This repo advertises a uniformly complete, 88%-covered, production-ready system on
top of a Cargo workspace that has never resolved its dependency graph. All
citations read from the working tree on 2026-07-27.

**README claims:**

- Line 9: `[![Status](https://img.shields.io/badge/status-production--ready-brightgreen.svg)](https://github.com/globalbusinessadvisors/llm-auto-optimizer)`
- Line 11: `[![Coverage](https://img.shields.io/badge/coverage-88%25-brightgreen.svg)](docs/TEST_COVERAGE_REPORT.md)`

The coverage badge is a hardcoded literal whose "evidence" link points at
`docs/TEST_COVERAGE_REPORT.md` — a checked-in markdown file, not the output of a
coverage run. An 88% figure that no tool emitted is a claim about nothing.

**Lines 48-60 are a 13-row feature table in which all 13 rows end in `| ✅ Complete |`:**
Feedback Collection, Stream Processing, Distributed State, Analyzer Engine,
Decision Engine, Canary Deployments, Storage Layer, REST API, gRPC API,
Integrations, CLI Tool, Main Service Binary, Deployment. A table with no variance
carries no information — it cannot distinguish a finished subsystem from an
unfinished one, which is the only reason to publish such a table.

**The workspace cannot build.** `Cargo.toml` lines 38-44 declare six upstream
dependencies as bare registry versions, with no `path` and no `git` source:

```toml
# LLM-Dev-Ops upstream dependencies (Phase 2B compile-time)
llm-cost-ops = "0.1"
llm-latency-lens = "0.1"
sentinel = "0.1"
llm-shield-core = "0.2"
llm-observatory-core = "0.1"
llm-config-manager = "0.1"
```

**There is no `Cargo.lock` anywhere in this repo** (0 files matched), across 16
workspace members. These versions have therefore never been resolved.

The sibling repo `benchmark-exchange` reached the opposite conclusion about the
same crate independently, and worked around it — `benchmark-exchange/Cargo.toml`
line 97:

```toml
llm-observatory-core = { git = "https://github.com/LLM-Dev-Ops/observatory", version = "0.1.1" }
```

It pins a git source precisely because the registry version is not obtainable.
Two repos in one workspace disagree about whether `llm-observatory-core` exists on
crates.io, and only the one with a lockfile is testable. Note also that
`sentinel = "0.1"` is an unnamespaced name likely to resolve to an *unrelated*
third-party crate on crates.io — a supply-chain hazard distinct from simply
failing to resolve.

The repo contains 2,161 `#[test]`/`#[tokio::test]` attributes. None of them can
have run: `cargo test` cannot execute without resolving the graph above. The 88%
coverage badge, the 13 "Complete" rows, and the production-ready status are all
downstream of a build that has never succeeded.

## Decision

**Dependency resolution is the precondition for every claim in this README. Until
`cargo build --locked` succeeds, the completeness table and the coverage and
status badges are withdrawn.**

Per ADR-013 Rule 4, the workspace commits a `Cargo.lock`. Per Rule 1, the
hand-typed coverage badge is replaced by a CI-generated one or deleted. Per Rule 2,
`✅ Complete` is reserved for subsystems with passing tests in CI.

Concretely:

1. Resolve the six LLM-Dev-Ops dependencies. For each, either pin a working `git`
   source as `benchmark-exchange` does, use a workspace `path`, or move it behind
   an off-by-default Cargo feature. Replace bare `sentinel = "0.1"` with an
   explicitly sourced dependency regardless of outcome — the ambiguous name is a
   supply-chain risk on its own.
2. Commit the resulting `Cargo.lock`.
3. Replace the line 11 coverage badge with a CI-generated badge from
   `cargo-tarpaulin` (or delete it). Delete `docs/TEST_COVERAGE_REPORT.md` or mark
   it as a historical estimate — it must not remain linked as evidence.
4. Regrade the lines 48-60 table against CI: `✅ Complete` only where that
   subsystem's tests pass; otherwise `🚧 In Progress` or `📋 Planned`. If the CI
   result is that all 13 genuinely pass, the table is unchanged and now means
   something.
5. Reword line 9's status badge to `status-alpha-orange` until steps 1-4 are green.

## Consequences

### Positive

- A committed lockfile makes the build reproducible and lets the 2,161 existing
  tests actually run — that is a large latent asset currently worth nothing.
- Resolving `sentinel = "0.1"` explicitly closes a real supply-chain hole, not
  just a documentation defect.
- A regraded table with mixed statuses becomes informative. The current all-green
  table cannot communicate anything.
- Aligns this repo with `benchmark-exchange`, which already solved the same
  upstream problem.

### Negative

- Resolution may reveal that several LLM-Dev-Ops crates are unavailable in any
  form, forcing feature-gating that visibly reduces the advertised surface. That
  reduction is real today and merely undisclosed.
- Regrading 13 rows against CI is likely to produce a much less impressive table.

### Risks

- Feature-gating may fragment the build matrix. Mitigation: define one default
  feature set that CI builds, and gate only genuinely unavailable integrations.
- A git-pinned upstream may itself be unbuildable, cascading the problem.
  Mitigation: vendor or stub the interface behind a trait if so; do not restore the
  badge on an unresolved graph.

## Implementation Plan

1. Attempt `cargo generate-lockfile`; record which of the six dependencies fail.
2. For each failure, choose a resolution: `git` pin (per `benchmark-exchange`
   line 97), workspace `path`, or off-by-default feature gate.
3. Replace `sentinel = "0.1"` with an explicitly sourced dependency.
4. Commit `Cargo.lock`.
5. Extend `.github/workflows/ci.yml` to run `cargo build --workspace --locked` and
   `cargo test --workspace`.
6. Add a `cargo-tarpaulin` job publishing a real coverage number.
7. Replace `README.md` line 11 with the generated coverage badge, or delete it.
8. Delete or historically annotate `docs/TEST_COVERAGE_REPORT.md`; remove it as the
   badge's evidence link.
9. Regrade each of the 13 rows at `README.md` lines 48-60 against CI results.
10. Set `README.md` line 9 to `status-alpha-orange`; restore `production--ready`
    only when steps 4-9 are green.

## Verification

- [ ] `Cargo.lock` exists at repo root and is tracked by git.
- [ ] `cargo build --workspace --locked` succeeds from a clean checkout.
- [ ] `cargo test --workspace` executes and reports a pass count.
- [ ] No bare-version LLM-Dev-Ops dependency remains in `Cargo.toml` lines 38-44;
      each has a `git`, `path`, or feature gate.
- [ ] `sentinel` is explicitly sourced, not resolved by bare name from crates.io.
- [ ] `grep -c "img.shields.io/badge/coverage" README.md` returns 0.
- [ ] Every `✅ Complete` row in `README.md` lines 48-60 maps to a passing CI test
      target.
- [ ] No `production--ready` badge appears while any of the above is unmet.
- [ ] `npm run check:claims-honesty` (agentics-enforcement) exits 0 for this repo.
