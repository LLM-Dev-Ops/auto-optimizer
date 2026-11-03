// Real component evaluation. A promotion here never waives repository-wide CI.
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const [baselineArg, candidateArg, toolsArg, outputArg] = process.argv.slice(2);
const baseline = resolve(baselineArg), candidate = resolve(candidateArg);
const tools = resolve(toolsArg), output = resolve(outputArg);
const packageDir = join(tools, 'node_modules/@metaharness/flywheel');
const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
if (manifest.version !== '0.1.12') throw new Error('Expected Flywheel 0.1.12');
const { runFlywheelGenerations, meetsPromotionRule, gateFingerprint, makeSigner, verifyReplayBundle } =
  await import(pathToFileURL(join(packageDir, 'dist/index.js')).href);
const fixture = 'tests/github-http-deadline.test.ts';
const fixtureBytes = readFileSync(join(candidate, fixture));
if (!fixtureBytes.equals(readFileSync(join(baseline, fixture)))) throw new Error('Evaluation fixture drift');
const names = [
  'holdout: stalled successful JSON body is bounded',
  'holdout: stalled error JSON body is bounded',
  'holdout: successful requests clear their abort timer',
  'holdout: rejected fetch clears its abort timer',
];
const measured = {};
function run(repo, label, kind) {
  const file = join(mkdtempSync(join(tmpdir(), 'auto-optimizer-eval-')), 'result.json');
  const test = kind === 'http' ? fixture : 'src/integrations/webhooks/tests/webhook.test.ts';
  const started = Date.now();
  const command = ['--runInBand', '--runTestsByPath', test, '--json', '--outputFile', file];
  const child = spawnSync(process.execPath, [join(repo, 'node_modules/jest/bin/jest.js'), ...command], { cwd: repo, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
  const report = JSON.parse(readFileSync(file, 'utf8'));
  const assertions = report.testResults.flatMap(result => result.assertionResults);
  const wins = kind === 'http'
    ? names.map(name => child.status === 0 && !child.error && !child.signal && assertions.some(item => item.title === name && item.status === 'passed'))
    : [child.status === 0 && report.numPassedTests === 43 && report.numFailedTests === 0];
  const evidence = { command: `node node_modules/jest/bin/jest.js --runInBand --runTestsByPath ${test} --json`, exit: child.status, signal: child.signal, error: child.error?.message ?? null, elapsedMs: Date.now() - started, executed: assertions.length, passed: report.numPassedTests, failedSuites: report.numFailedTestSuites, wins, outputSha256: createHash('sha256').update(`${child.stdout || ''}${child.stderr || ''}`).digest('hex') };
  measured[`${label}:${kind}`] = evidence;
  return wins;
}
const evaluator = async (policy, suite) => {
  const label = policy.implementation;
  const kind = suite.id === 'github-deadline-live-v1' ? 'http' : 'webhooks';
  const wins = run(label === 'baseline' ? baseline : candidate, label, kind);
  const passed = wins.filter(Boolean).length;
  return { primary: passed / wins.length, noopRate: 1 - passed / wins.length, costPerWin: passed ? wins.length / passed : 999, regressed: kind === 'webhooks' && passed !== wins.length, itemWins: wins };
};
const sourcePath = 'src/integrations/github/github-client.ts';
const parentBytes = readFileSync(join(baseline, sourcePath), 'utf8');
const baselineRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: baseline, encoding: 'utf8' }).trim();
if (parentBytes !== execFileSync('git', ['show', `${baselineRevision}:${sourcePath}`], { cwd: baseline, encoding: 'utf8' })) throw new Error('Baseline source drift');
const inverse = { path: sourcePath, parentBytes, hash: createHash('sha256').update(parentBytes).digest('hex') };
const sourcePatch = execFileSync('git', ['diff', baselineRevision, '--', sourcePath, 'src/integrations/github/github-auth.ts'], { cwd: candidate, encoding: 'utf8' });
if (!sourcePatch.trim()) throw new Error('Missing implementation patch');
execFileSync('git', ['apply', '--check', '--reverse'], { cwd: candidate, input: sourcePatch });
const pinnedGateFingerprint = gateFingerprint(meetsPromotionRule);
const result = await runFlywheelGenerations({
  rootPolicy: { implementation: 'baseline' },
  proposer: async () => ({ value: 'candidate', summary: 'Bound GitHub response-body deadlines and clean up aborted/failed requests; compile and validate actual client boundary', inverse }),
  evaluator,
  holdout: { id: 'github-deadline-live-v1', items: names },
  anchor: { id: 'webhook-security-43-v1', items: ['all 43 existing webhook tests'] },
  mutationTargets: ['implementation'], maxGenerations: 1,
  promotionRule: meetsPromotionRule, signer: makeSigner(), dataSource: 'LIVE_LOOPBACK_HTTP_WITH_COMPILE_PREREQUISITE',
});
const replayVerdict = verifyReplayBundle(result.replayBundle, { pinnedGateFingerprint });
if (!replayVerdict.pass) throw new Error('Signed replay failed');
const evidence = { scope: 'GitHub HTTP component only; baseline compilation failed before HTTP execution. Full Rust/Node gates remain mandatory.', baselineRevision, model: 'none; frozen command contract', versions: { flywheel: manifest.version, node: process.version }, fixtureSha256: createHash('sha256').update(fixtureBytes).digest('hex'), measured, pinnedGateFingerprint, rollback: { path: sourcePath, inverseHash: inverse.hash, reversePatchApplicable: true, productionRollbackExecuted: false }, finalPolicy: result.finalPolicy, liftCurve: result.liftCurve, replayVerdict, replayBundle: result.replayBundle };
writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ measured, finalPolicy: result.finalPolicy, liftCurve: result.liftCurve, replayVerdict, rollback: evidence.rollback }, null, 2));
