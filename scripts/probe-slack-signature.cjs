const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {createServer}=require('node:http');
const crypto=require('node:crypto');
const Module=require('node:module');
async function probe(root){
 root=resolve(root);const ts=require(require.resolve('typescript',{paths:[root]}));
 const filename=resolve(root,'src/integrations/slack/slack-webhooks.ts');
 const code=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(root);mod._compile(code,filename);
 const {SlackWebhookProcessor,verifyWebhookSignature}=mod.exports;
 const secret='synthetic-signature-fixture',body=JSON.stringify({type:'url_verification',challenge:'fixture-challenge'}),now=String(Math.floor(Date.now()/1000));
 const sign=(timestamp,b=body)=>'v0='+crypto.createHmac('sha256',secret).update(`v0:${timestamp}:${b}`).digest('hex');
 const processor=new SlackWebhookProcessor({signingSecret:secret});const holdout=[],anchors=[];
 async function check(list,name,fn){try{await fn();list.push({name,passed:true});}catch(e){list.push({name,passed:false,error:e.message});}}
 for(const [name,signature]of [['missing',''],['short','v0=abc'],['long','v0='+'0'.repeat(65)],['multibyte','v0='+'é'.repeat(64)]])await check(holdout,`malformed ${name} returns false`,()=>assert.equal(processor.verifySignature({signature,timestamp:now,body}).valid,false));
 for(const timestamp of ['not-a-time',now+'junk'])await check(holdout,`signed malformed timestamp ${timestamp==='not-a-time'?'non-numeric':'suffix'} rejected`,()=>assert.equal(processor.verifySignature({signature:sign(timestamp),timestamp,body}).valid,false));
 await check(anchors,'current valid HMAC accepted',()=>assert.equal(processor.verifySignature({signature:sign(now),timestamp:now,body}).valid,true));
 await check(anchors,'UTF8 Buffer body accepted',()=>assert.equal(processor.verifySignature({signature:sign(now),timestamp:now,body:Buffer.from(body)}).valid,true));
 await check(anchors,'standalone valid verifier retained',()=>assert.equal(verifyWebhookSignature(body,now,sign(now),secret),true));
 for(const [name,offset]of [['stale',-600],['future',600]])await check(anchors,`${name} valid signature rejected`,()=>{const timestamp=String(Number(now)+offset);assert.equal(processor.verifySignature({signature:sign(timestamp),timestamp,body}).valid,false);});
 const server=createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);try{const result=await processor.processWebhook({signature:req.headers['x-slack-signature']||'',timestamp:req.headers['x-slack-request-timestamp']||'',body:Buffer.concat(chunks)});res.setHeader('content-type','application/json');res.end(JSON.stringify(result));}catch(e){res.statusCode=e.code==='INVALID_SIGNATURE'?400:500;res.end(JSON.stringify({code:e.code||e.name}));}});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const request=async(timestamp,signature)=>{const r=await fetch('http://127.0.0.1:'+server.address().port,{method:'POST',headers:{'x-slack-request-timestamp':timestamp,'x-slack-signature':signature},body,signal:AbortSignal.timeout(2000)});return{status:r.status,body:await r.json()};};
 try{
  await check(holdout,'HTTP invalid signature maps to typed rejection',async()=>{const r=await request(now,'');assert.equal(r.status,400);assert.equal(r.body.code,'INVALID_SIGNATURE');});
  await check(holdout,'HTTP signed nonnumeric timestamp cannot authenticate',async()=>{const r=await request('NaN',sign('NaN'));assert.equal(r.status,400);assert.equal(r.body.code,'INVALID_SIGNATURE');});
  await check(anchors,'HTTP valid challenge retained',async()=>{const r=await request(now,sign(now));assert.equal(r.status,200);assert.equal(r.body.challenge,'fixture-challenge');});
 }finally{server.closeAllConnections();await new Promise(ok=>server.close(ok));}
 return{holdout,anchors};
}
module.exports={probe};
if(require.main===module)probe(process.argv[2]||'.').then(r=>{console.log(JSON.stringify(r));if([...r.holdout,...r.anchors].some(x=>!x.passed))process.exitCode=1;});
