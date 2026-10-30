const { spawnSync }=require('node:child_process');
const { resolve }=require('node:path');
const [base,head]=process.argv.slice(2).map(x=>resolve(x));
const trials=[];
for(let i=0;i<5;i++) for(const [label,repo] of (i%2?[['candidate',head],['baseline',base]]:[['baseline',base],['candidate',head]])) {
  const start=process.hrtime.bigint();const r=spawnSync(process.execPath,['scripts/probe-slack-oauth.cjs','.'],{cwd:repo,encoding:'utf8',timeout:10000});
  const p=JSON.parse(r.stdout.trim());trials.push({trial:i,label,exit:r.status,elapsedMs:Number(process.hrtime.bigint()-start)/1e6,holdout:p.holdout.filter(x=>x.passed).length,anchors:p.anchors.filter(x=>x.passed).length});
}
console.log(JSON.stringify({trials,note:'Fresh-process native HTTP contract stability; watchdog-bound baseline is not a performance speedup benchmark.'}));
