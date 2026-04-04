/**
 * acp-mode.ts - ACP (Agent Client Protocol) sidecar for Meow
 * Implements JSON-RPC 2.0 over stdio for programmatic control.
 * Methods: initialize, newSession, loadSession, prompt, cancel
 */
import{runLeanAgent}from"../core/lean-agent.ts";
import{initializeToolRegistry,getAllTools}from"./tool-registry.ts";
import{createSession,appendToSession,loadSession}from"../core/session-store.ts";
interface R{jsonrpc:"2.0";id:string|number|null;method:string;params?:Record<string,unknown>;}
interface S{jsonrpc:"2.0";id:string|number|null;result?:unknown;error?:{code:number;message:string;};}
interface Session{id:string;messages:{role:string;content:string;timestamp:string}[];}
let cs:Session|null=null;let ca:AbortController|null=null;let dm=false;
function out(s:S){process.stdout.write(JSON.stringify(s)+"
");}
async function init(p){if(p.dangerous===true)dm=true;return{protocolVersion:"1.0",capabilities:{sessions:true,tools:true}};}
async function newSess(){if(cs)appendToSession(cs.id,cs.messages);const id=createSession();cs={id,messages:[]};return{sessionId:id};}
async function loadSess(p){const sid=p.sessionId as string;if(!sid)throw new Error("sessionId required");const msgs=loadSession(sid);cs={id:sid,messages:msgs};return{sessionId:sid,messages:msgs};}
async function prompt(p){const t=p.prompt as string;if(!t)throw new Error("prompt required");ca=new AbortController();const msgs=cs?.messages??[];try{const r=await runLeanAgent(t,{dangerous:dm,abortSignal:ca.signal,messages:msgs.map(m=>({role:m.role,content:m.content}))});if(cs){cs.messages.push({role:"user",content:t,timestamp:new Date().toISOString()},{role:"assistant",content:r.content,timestamp:new Date().toISOString()});}return{content:r.content,usage:r.usage};}finally{ca=null;}}
async function cancel(){if(ca){ca.abort();return{cancelled:true};}return{cancelled:false};}
async function dispatch(r:R){const{id,method,params={}}=r;try{let result:unknown;switch(method){case"initialize":result=await init(params);break;case"newSession":result=await newSess();break;case"loadSession":result=await loadSess(params);break;case"prompt":result=await prompt(params);break;case"cancel":result=await cancel();break;case"tools/list":result=getAllTools().map(t=>({name:t.name,description:t.description}));break;default:out({jsonrpc:"2.0",id,error:{code:-32601,message:"Method not found: "+method}});return;}out({jsonrpc:"2.0",id,result});}catch(e:any){out({jsonrpc:"2.0",id,error:{code:-32603,message:e.message}});}}
function valid(o:unknown):boolean{return typeof o==="object"&&o!==null&&(o as any).jsonrpc==="2.0"&&typeof(o as any).method==="string";}
export async function startACPServer(){await initializeToolRegistry();const rl=await import("node:readline").then(m=>m.createInterface({input:process.stdin,crlfDelay:Infinity}));for await(const line of rl){const t=line.trim();if(!t)continue;let p:unknown;try{p=JSON.parse(t);}catch{out({jsonrpc:"2.0",id:null,error:{code:-32700,message:"Parse error"}});continue;}if(Array.isArray(p)){for(const r of p){if(valid(r))await dispatch(r as R);}}else if(valid(p)){await dispatch(p as R);}}}}}