# GitHub integration deadline recovery

## Scope and frozen contract

Resumed ready PR #3 at `a13196ccb0e1aba13fea3dbe89b870e8892c03e2` rather than
creating a duplicate. Main was `114865b4c3beb78b9fbeacbfc19ef93ab4501f97`.
Separate baseline/candidate worktrees and a single writer were used. No repository
AGENTS.md or CLAUDE.md was present. Current manifests, instructions in README,
existing PR evidence, workflows and source were inspected.

The full Jest baseline executed 101 passing tests in four suites; six other
suites failed compilation. The new frozen contract requires the actual GitHub
client to abort stalled success/error bodies and clear its abort timer after
success/fetch rejection. Existing webhook/security behavior must remain passing.
These criteria were recorded on the PR before implementation. No diagnostics,
tests, assertions, timeout bounds or repository-wide gates were disabled.

## Implementation

Fetch resolves when response headers arrive. Previously the client cleared its
deadline immediately, so subsequent body reads were unbounded. The deadline now
covers fetch and body parsing, with timer cleanup in finally on every exit.
Error responses reuse the parsed body, without double consumption. The transport
status and fallback error message cannot be overwritten by response JSON.

The source also contained type errors masked by the root build's integration
exclusions. Generic response JSON now has an explicit API type boundary; OAuth
and installation-token JSON have runtime shape checks. Five malformed OAuth
fixtures are rejected and a valid optional-field response is preserved.

GitHub unit tests now use the repository's actual Jest runner instead of an
uninstalled Vitest import. A duplicate fixture property was removed without
changing its effective value. The model-selection CLI helper is statically
imported so its constraints retain their types. Slack callback fixtures use the
actual declared handler types, but its suite remains blocked by separate
slack-auth unknown-JSON type errors. Three older integration suites still use
obsolete GitHub constructor/method signatures and remain compile-blocked.

The existing Node CI check now runs the entire Jest suite, rather than only
webhooks. A separate SHA-pinned Ubuntu 24.04 / Node 20.19.5 check runs strict
GitHub client type checking and native HTTP/auth/GitHub regressions. No Rust,
release, publishing workflow or branch-protection condition was weakened.

## Real measurements and limitations

| Gate | Prior PR head | Candidate |
| --- | ---: | ---: |
| Full Jest executed tests passing | 101 | 203 |
| Jest suites passing / compile-failed | 4 / 6 | 8 / 4 |
| Native HTTP contract execution | Compile-blocked, zero executed | 8/8 |
| Frozen deadline criteria | Compile prerequisite failed | 4/4 |
| Existing webhook/security anchors | 43/43 | 43/43 |
| Existing performance tests | 6/6 | 6/6 |
| Production npm advisories | 0 | 0 |
| Root TypeScript build exit | 0 | 0 |
| Targeted strict GitHub type check | Fails on source errors | 0 |

The eight native HTTP cases use a real local Node server and native fetch, not
mocked transport: four frozen criteria, three compatibility cases and one
additional transport-status regression. The configured deadline is 100 ms with
a fixed 500 ms observation bound. The OAuth unit fixtures and the existing
webhook tests use test transports; they are not evidence of contacting external
providers. No OAuth requests, task data or paid model calls were sent externally.

Baseline HTTP assertions could not execute because the original client/auth
source failed TypeScript compilation. Do NOT describe this as four observed
runtime deadline failures or claim a measured baseline latency improvement.
The candidate's real HTTP behavior is measured; baseline runtime behavior was
diagnosed from source, with that uncertainty preserved. The performance suite
exercised existing workload thresholds; no speedup or application benchmark
comparison is claimed.

Full Jest still exits 1 despite all 203 executed assertions passing, because four
suites cannot compile. `npm run lint` exits 2 because ESLint configuration is
absent; no empty or permissive config was added to manufacture success. The root
build alone is not full integration validation: it excludes several SDK folders.
The targeted check uses strict TypeScript with the exact flags in the workflow.

RuOS ran the idempotent research-lab bootstrap and verified OpenSSL 3.0.13.
Protobuf compiler/headers and libpq development headers were restored separately.
Real locked Rust tests exited 101 (processor compilation had 28 errors). After
restoring protoc, build exited 101 (CLI compilation had six errors). Strict
Clippy exited 101 on an existing derivable-impl lint; formatting exited 1.
Cargo audit exited 1 with 15 vulnerabilities and ten warnings. A remote exec
transport failure was retried safely; its exit was not treated as execution
proof, and logs/owned exit files were inspected afterward. Rust source, Cargo
manifests and Cargo.lock are unchanged by this recovery.

## Pinned execution ledger

Current upstream MetaHarness revision was verified as
`e0dfd44da72b7adfb7c57fdd42d124be58ed7086`; main, Darwin and Flywheel docs/manifests
were inspected. An expired temporary tool cache initially returned MODULE_NOT_FOUND.
Exact versions were installed in an isolated directory: Ruflo 3.56.3,
Transformers 4.3.1, MetaHarness 0.4.17, Darwin 0.10.3 and Flywheel 0.1.12.

Ruflo pre-task `task-mvccpw40` and real hierarchical coordination
`swarm-1792238820384-rvz2qb` executed with one writer and zero delegated workers.
Coordination is not claimed as implementation. MetaHarness `score . --json`
exited 0 with fit 82 and hard constraints 6/6 on both trees. Its compile-confidence
estimate is static and does not override the observed build/test failures.

Darwin ran one generation/two children, concurrency one, seed 2026101708,
`--sandbox real --selection pareto`, with npm test fixed and no model calls.
All variants scored 0.135 with testPassRate zero: reviewer and scorePolicy
children tied baseline and were rejected. No harness improvement is claimed;
the repo-test substrate cannot distinguish those policy surfaces.

Flywheel actually invoked the frozen HTTP evaluator and 43-test webhook anchor
on both worktrees. A failed compile prerequisite scores no resolved HTTP cases;
the candidate resolves 4/4 and preserves 43/43 anchors. The component policy was
promoted, primary 0 to 1, and all eight signed replay checks passed. One component
promotion is not full repository acceptance or a compounding milestone. The
adjacent Flywheel JSON includes actual exits, fixture hash, lineage and signed
receipts. Run:

```bash
npm ci --ignore-scripts
node scripts/evaluate-github-deadline.mjs BASELINE CANDIDATE ISOLATED_TOOLS OUTPUT_JSON
```

ISOLATED_TOOLS must contain the exact Flywheel 0.1.12 package under node_modules.
Use the identical committed HTTP fixture in the baseline checkout; the runner
rejects fixture drift. The parent GitHub client bytes/hash are recorded, and a
reverse-patch applicability check covers both modified GitHub source files.

Core-memory returned no screened playbooks or warnings. Explicit user guidance
was mapped to Rust-core preservation, TypeScript boundary validation, Linux-first
deterministic CI and no new persistence service. Existing authorized memory
interfaces are used for auditable learning, with the research-lab offline runner,
kernel socket denial and checksum-pinned local MiniLM model. The final hook's
actual blocked outcome and persistence flags are reported on the PR.

## Coverage, remaining work and rollback

Fully paginated 58 nonarchived repositories and all 117 open PRs. Current default
branch and latest CI were inspected for every repository. Worked auto-optimizer;
all other 57 repositories are named as deferred in the adjacent execution ledger.
Memory-graph PR #3 remains unmerged; its prior exact-head CI finished failing.
Rotation resumed a different repository rather than repeatedly editing that PR.

Outcome: EXECUTED, GitHub component VALIDATED, full repository BLOCKED, NOT MERGED.
Next repairs are the four remaining TypeScript suites, real ESLint configuration
and violations, processor/CLI Rust compilation, strict Rust lints and locked
dependency vulnerabilities. Component success does not waive any of these.

Revert this recovery commit to return to the previous PR head while retaining
the earlier signed-webhook fix. The recorded reverse patch only checks rollback
applicability; no production rollback executed. No deployment, publishing,
force-push, paid provisioning, alternate persistence service or service-owned
database was introduced. Existing architecture debt was not relabeled compliant.
