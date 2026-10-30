# Frozen Slack OAuth acceptance contract — October 30, 2026

Parent: e544ac4cb47f1cc9db15c76002c66f00f04f9b53; main: 114865b4c3beb78b9fbeacbfc19ef93ab4501f97.
Resume PR #3, isolated writer; preserve every original assertion, lockfile and architecture.

Acceptance: 15 native loopback HTTP holdouts frozen before implementation (body
deadlines, transport status, stored token/team/user fields, finite positive expiry,
non-object response); six valid-behavior/state anchors; no lost previously passing
Jest assertion. The probe transpiles actual source only for runtime observation;
strict TypeScript checking is an independent mandatory gate, not bypassed.
The independent 400ms watchdog is a failure, not a passing client timeout.
Use equal 150s Node/full-suite, 90s Rust test/build/Clippy, 60s audit budgets.
All native build/test/lint/security/coverage gates must pass for promotion/merge;
timeout, missing reports and nonzero exit are failure. Cost is unmeasured/neutral,
and failed-contract ratio is a proxy, not an observed agent-noop metric.
No latency improvement target or paid provider calls. GitHub Actions must validate
the exact resulting commit. Preserve required approvals and main freshness.

Before final comparison the identical fixture on both revisions was expanded to
16 checks (the boolean auth-test body deadline). Explicit `Connection: close`
avoids reusing sockets forcibly closed by prior stalled-body cleanup. The first
candidate's 13/15 result is retained, not presented as acceptance; the stabilized
fixture must be rerun against the unchanged original source and final candidate.
