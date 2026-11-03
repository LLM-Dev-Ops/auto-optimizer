import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const [base,candidate,tools,out,tree,commit]=process.argv.slice(2);mkdirSync(out,{recursive:true});
const run=(cwd,args,timeout=25000)=>{const p=spawnSync(args[0],args.slice(1),{cwd,encoding:'utf8',timeout,maxBuffer:16*1024*1024});return {command:args,status:p.status,signal:p.signal,error:p.error?.message,stdout:p.stdout,stderr:p.stderr};};
const current=()=>run(candidate,['git','write-tree']).stdout.trim();
if(current()!==tree||run(candidate,['git','diff','--quiet']).status!==0)throw Error('Candidate tracked bytes do not match committed Git tree');
const m={};
for(const [k,root]of [['baseline',base],['candidate',candidate]]){
 if(process.argv.includes('--resume-measurements')){
  m[k]=JSON.parse(readFileSync(join(out,k+'.json'),'utf8'));
  const expected=k==='candidate'?commit:run(root,['git','rev-parse','HEAD']).stdout.trim();
  if(m[k].revision!==expected)throw Error('Cannot resume a different measured revision');
  continue;
 }
 const report=join(out,k+'-jest.json');
 const jest=run(root,['npm','test','--','--runInBand','--json','--outputFile='+report],35000);
 const trials=Array.from({length:3},()=>run(root,['node',join(candidate,'scripts/probe-slack-signature.cjs'),root],10000));
 const build=run(root,['npm','run','build']);const lint=run(root,['npm','run','lint']);
 const strict=run(root,['node','node_modules/typescript/bin/tsc','--noEmit','--strict','--esModuleInterop','--target','ES2022','--lib','ES2022','--types','node','--module','commonjs','--skipLibCheck','src/integrations/slack/slack-webhooks.ts']);
 const audit=run(root,['npm','audit','--json']);const productionAudit=run(root,['npm','audit','--omit=dev','--json']);
 const reportData=existsSync(report)?JSON.parse(readFileSync(report)):null;
 m[k]={revision:k==='candidate'?commit:run(root,['git','rev-parse','HEAD']).stdout.trim(),identity:k==='candidate'?{tree,method:'Local index/tree plus clean tracked worktree compared with already-created GitHub commit tree; shell fetch approval cancelled, not retried'}:undefined,jest,build,lint,strict,audit,productionAudit,trials,report:reportData};
 writeFileSync(join(out,k+'.json'),JSON.stringify(m[k],null,2));
}
const passing=r=>r?.testResults.flatMap(s=>s.assertionResults).filter(t=>t.status==='passed').map(t=>t.fullName)||[];
const retained=new Set(passing(m.candidate.report)),lost=passing(m.baseline.report).filter(n=>!retained.has(n));
if(current()!==tree||run(candidate,['git','diff','--quiet']).status!==0)throw Error('Tracked bytes changed during evaluation');
const fw=await import(pathToFileURL(join(tools,'node_modules/@metaharness/flywheel/dist/index.js')));
const parent=readFileSync(join(base,'src/integrations/slack/slack-webhooks.ts'),'utf8');
const result=await fw.runFlywheelGenerations({rootPolicy:{revision:m.baseline.revision},proposer:async()=>({value:commit,summary:'Strict timestamp and fixed signature shape before timing-safe verification; positive fixtures signed rather than bypassed',inverse:{path:'src/integrations/slack/slack-webhooks.ts',parentBytes:parent,hash:createHash('sha256').update(parent).digest('hex')}}),evaluator:async(p,s)=>{const r=p.revision===commit?m.candidate:m.baseline;const records=r.trials.flatMap(t=>JSON.parse(t.stdout)[s.id]);return {primary:records.filter(x=>x.passed).length/records.length,noopRate:0,costPerWin:0,regressed:true,itemWins:records.map(x=>x.passed)};},holdout:{id:'holdout',items:Array.from({length:24},(_,i)=>i)},anchor:{id:'anchors',items:Array.from({length:18},(_,i)=>i)},maxGenerations:1,signer:fw.makeSigner(),promotionRule:fw.meetsPromotionRule,dataSource:'LIVE_ACTUAL_SOURCE_NATIVE_HTTP_SYNTHETIC_FIXTURES'});
const replay=fw.verifyReplayBundle(result.replayBundle,{pinnedGateFingerprint:fw.gateFingerprint(fw.meetsPromotionRule)});
writeFileSync(join(out,'flywheel.json'),JSON.stringify({replay,replayBundle:result.replayBundle,measurementFiles:['baseline.json','candidate.json'],passingAssertionsLost:lost,fullGate:'BLOCKED: full Jest/lint/security/Rust/CI/Ruflo/approval gates incomplete or failing; fail closed'},null,2));
console.log(JSON.stringify({summaries:Object.fromEntries(Object.entries(m).map(([k,v])=>[k,{revision:v.revision,pass:v.report?.numPassedTests,fail:v.report?.numFailedTests,failedSuites:v.report?.numFailedTestSuites,build:v.build.status,strict:v.strict.status,lint:v.lint.status,audit:v.audit.status,productionAudit:v.productionAudit.status,trials:v.trials.map(t=>{let r=JSON.parse(t.stdout);return{holdout:r.holdout.filter(x=>x.passed).length,anchors:r.anchors.filter(x=>x.passed).length};})}])),lost,promotions:result.replayBundle.verified_improvements,replay}));if(!replay.pass)process.exitCode=1;
