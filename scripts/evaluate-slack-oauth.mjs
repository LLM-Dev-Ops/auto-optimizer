import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const [baseArg, headArg, toolsArg, outArg] = process.argv.slice(2);
const base = resolve(baseArg), head = resolve(headArg), tools = resolve(toolsArg), out = resolve(outArg);
const fixture = 'scripts/probe-slack-oauth.cjs';
const digest = x => createHash('sha256').update(x).digest('hex');
const frozen = [fixture, 'package-lock.json', 'Cargo.lock', 'jest.config.js'];
for (const path of frozen) if (!readFileSync(join(base,path)).equals(readFileSync(join(head,path)))) throw Error('Frozen bytes drift: '+path);
const cwd = mkdtempSync(join(tmpdir(), 'slack-oauth-eval-'));
const measurements = {};
function run(repo, label, key, cmd, args, seconds) {
  const started = Date.now();
  const result = spawnSync(cmd, args, {cwd:repo, encoding:'utf8',timeout:seconds*1000,maxBuffer:32*1024*1024,env:{...process.env,CARGO_TARGET_DIR:'/tmp/auto-optimizer-oct30b-target'}});
  const output = `${result.stdout||''}${result.stderr||''}`;
  writeFileSync(join(cwd,`${label}-${key}.log`),output);
  return {command:[cmd,...args],exit:result.status,signal:result.signal,error:result.error?.message??null,elapsedMs:Date.now()-started,outputSha256:digest(output),pass:result.status===0&&!result.error&&!result.signal};
}
function measure(repo,label) {
  const probe = run(repo,label,'probe',process.execPath,[fixture,'.'],10);
  const raw=readFileSync(join(cwd,`${label}-probe.log`),'utf8');
  const parsed=JSON.parse(raw.trim().split('\n').find(x=>x.startsWith('{')));
  const jestPath=join(cwd,`${label}-jest.json`);
  const jest=run(repo,label,'jest','npm',['test','--','--runInBand','--json','--outputFile='+jestPath],150);
  let report={};try{report=JSON.parse(readFileSync(jestPath,'utf8'));}catch{}
  const passing=(report.testResults||[]).flatMap(s=>(s.assertionResults||[]).filter(a=>a.status==='passed').map(a=>s.name.slice(repo.length)+':'+a.fullName)).sort();
  const checks={
    probe, jest,
    strictAuth:run(repo,label,'strict-auth',process.execPath,['node_modules/typescript/bin/tsc','--noEmit','--strict','--esModuleInterop','--target','ES2022','--module','commonjs','--skipLibCheck','src/integrations/slack/slack-auth.ts'],90),
    build:run(repo,label,'build','npm',['run','build'],90),
    lint:run(repo,label,'lint','npm',['run','lint'],45),
    coverage:run(repo,label,'coverage','npm',['run','test:coverage','--','--runInBand'],150),
    npmAudit:run(repo,label,'npm-audit','npm',['audit','--json'],60),
    productionAudit:run(repo,label,'production-audit','npm',['audit','--omit=dev','--json'],60),
    rustTest:run(repo,label,'rust-test','cargo',['+1.88.0','test','--workspace','--locked','--offline','-j2'],90),
    rustBuild:run(repo,label,'rust-build','cargo',['+1.88.0','build','--workspace','--locked','--offline','-j2'],90),
    clippy:run(repo,label,'clippy','cargo',['+1.88.0','clippy','--workspace','--all-targets','--all-features','--locked','--offline','-j2','--','-D','warnings'],90),
    fmt:run(repo,label,'fmt','cargo',['+1.88.0','fmt','--all','--','--check'],45),
    rustAudit:run(repo,label,'rust-audit','cargo',['audit','--file','Cargo.lock','--no-fetch','--json'],60),
  };
  const result={probe:parsed,checks,passing,passedTests:report.numPassedTests??0,failedTests:report.numFailedTests??0,failedSuites:report.numFailedTestSuites??0};
  measurements[label]=result;writeFileSync(out+'.progress.json',JSON.stringify({cwd,measurements},null,2));
  return result;
}
const baseline=measure(base,'baseline'),candidate=measure(head,'candidate');
const lost=baseline.passing.filter(name=>!candidate.passing.includes(name));
const pkg=join(tools,'node_modules/@metaharness/flywheel');
if(JSON.parse(readFileSync(join(pkg,'package.json'))).version!=='0.1.12')throw Error('Flywheel version drift');
const {runFlywheelGenerations,meetsPromotionRule,gateFingerprint,makeSigner,verifyReplayBundle}=await import(pathToFileURL(join(pkg,'dist/index.js')).href);
const gate=gateFingerprint(meetsPromotionRule);
const source='src/integrations/slack/slack-auth.ts';
const parentBytes=readFileSync(join(base,source),'utf8');
const baseSha=execFileSync('git',['rev-parse','HEAD'],{cwd:base,encoding:'utf8'}).trim();
const headSha=execFileSync('git',['rev-parse','HEAD'],{cwd:head,encoding:'utf8'}).trim();
const result=await runFlywheelGenerations({
  rootPolicy:{revision:baseSha},
  proposer:async()=>({value:{revision:headSha},summary:'Bound Slack OAuth bodies and validate fields before token storage',inverse:{path:source,parentBytes,sha256:digest(parentBytes)}}),
  evaluator:async(policy,suite)=>{
    const m=policy.revision===baseSha?baseline:candidate;
    const cases=suite.id==='oauth-holdout'?m.probe.holdout:m.probe.anchors;
    const primary=cases.filter(x=>x.passed).length/cases.length;
    return {primary,noopRate:1-primary,costPerWin:0,regressed:Object.values(m.checks).some(x=>!x.pass)||(m===candidate&&lost.length>0)};
  },holdout:{id:'oauth-holdout',items:candidate.probe.holdout.map(x=>x.name)},anchor:{id:'oauth-anchor',items:candidate.probe.anchors.map(x=>x.name)},maxGenerations:1,signer:makeSigner(),promotionRule:meetsPromotionRule,dataSource:'LIVE',
});
const replay=verifyReplayBundle(result.replayBundle,{pinnedGateFingerprint:gate});
writeFileSync(out,JSON.stringify({versions:{flywheel:'0.1.12',node:process.version},baseSha,headSha,frozen:Object.fromEntries(frozen.map(p=>[p,digest(readFileSync(join(base,p)))])),gate,measurements,lostPreviouslyPassing:lost,logs:cwd,result,replay,metricLimitations:'costPerWin=0 is neutral/unmeasured; noopRate is failed-contract ratio, not observed agent noops; transpiled runtime probe is not strict compile proof'},null,2));
console.log(JSON.stringify({baseSha,headSha,baseline:baseline.passedTests,candidate:candidate.passedTests,lost:lost.length,promotions:result.promotions,replay,cwd}));
