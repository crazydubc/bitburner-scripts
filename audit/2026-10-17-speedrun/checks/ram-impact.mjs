// Pinned official RAM calculator, with a JS-only parser/module-loading adapter.
// Node 24: node --expose-internals .../ram-impact.mjs /path/to/bitburner-src [baseline-ref]
import assert from 'node:assert/strict';
import {registerHooks, stripTypeScriptTypes, createRequire} from 'node:module';
import {readFileSync, existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(process.argv[2]);
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(import.meta.url);
// These are Node's bundled parser/walker, not downloads or project dependencies.
const acorn = require('internal/deps/acorn/acorn/dist/acorn');
const native = name => `import {createRequire} from 'node:module'; const value=createRequire(${JSON.stringify(import.meta.url)})(${JSON.stringify(name)});`;
const stubs = {
  walk: native('internal/deps/acorn/acorn-walk/dist/walk') + 'export const base=value.base, recursive=value.recursive;',
  types: 'export const extendAcornWalkForTypeScriptNodes=()=>{};',
  jsx: 'export const extend=()=>{};',
  player: 'export const Player={bitNodeN:1, activeSourceFileLvl:()=>3};',
  transformer: `
    import {posix} from 'node:path';
    ${native('internal/deps/acorn/acorn/dist/acorn')}
    export class ModuleResolutionError extends Error {}
    export const getFileType=()=>0, getFileTypeFeature=()=>({isReact:false,isTypeScript:false});
    export const parseAST=(file,host,code)=>value.parse(code,{ecmaVersion:'latest',sourceType:'module'});
    export function getModuleScript(name,base,scripts) {
      const filename=posix.normalize(name.startsWith('.')?posix.join(posix.dirname(base),name):name).replace(/^[/]/,'');
      const script=scripts.get(filename);
      if(!script) throw new ModuleResolutionError('Missing module '+filename+' imported by '+base);
      return script;
    }`,
};
const replacements = new Map([
  ['src/ThirdParty/acorn-typescript-walk.ts','types'], ['src/utils/ScriptTransformer.ts','transformer'],
].map(([file,stub])=>[resolve(root,file),stub]));
registerHooks({
  resolve(specifier, context, next) {
    const alias = specifier === 'acorn-walk' ? 'walk' : specifier === 'acorn-jsx-walk' ? 'jsx'
      : specifier === '@player' ? 'player' : specifier === '../ThirdParty/acorn-typescript-walk' ? 'types' : null;
    if(alias) return {url:'ramcheck:'+alias,shortCircuit:true};
    if(specifier.startsWith('.') && context.parentURL?.startsWith(pathToFileURL(root).href)) {
      let path=resolve(dirname(fileURLToPath(context.parentURL)),specifier);
      if(!existsSync(path) && existsSync(path+'.ts')) path+='.ts';
      return {url:replacements.has(path)?'ramcheck:'+replacements.get(path):pathToFileURL(path).href,shortCircuit:true};
    }
    return next(specifier,context);
  },
  load(url,context,next) {
    if(url.startsWith('ramcheck:')) return {format:'module',source:stubs[url.slice(9)],shortCircuit:true};
    if(url.startsWith(pathToFileURL(root).href) && url.endsWith('.ts')) {
      const source=readFileSync(fileURLToPath(url),'utf8').replace('import { NSFull } from "../NetscriptFunctions";','');
      return {format:'module',source:stripTypeScriptTypes(source,{mode:'transform'}),shortCircuit:true};
    }
    return next(url,context);
  },
});
const {calculateRamUsage}=await import(pathToFileURL(resolve(root,'src/Script/RamCalculations.ts')).href);
const paths=execFileSync('rg',['--files','-g','*.js','-g','!audit/**'],{cwd:repo,encoding:'utf8'}).trim().split('\n');
function scripts(ref) {
  const result=new Map();
  for(const filename of paths) {
    let code;
    try { code=ref?execFileSync('git',['show',`${ref}:${filename}`],{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','ignore']}):readFileSync(resolve(repo,filename),'utf8'); }
    catch { continue; }
    result.set(filename,{filename,server:'home',code});
  }
  return result;
}
const current=scripts(), baseline=process.argv[3]?scripts(process.argv[3]):null;
function cost(files,name,ignoreOverride=false) {
  const code=files.get(name)?.code;
  if(code===undefined) return null;
  const input=ignoreOverride?code.replace(/ns\.ramOverride\(([\d.]+)\)/g,'$1'):code;
  const result=calculateRamUsage(acorn.parse(input,{ecmaVersion:'latest',sourceType:'module'}),name,'home',files);
  assert.equal(result.errorCode,undefined,`${name}: ${result.errorMessage}`);
  return result.cost;
}
const targets=['autopilot.js','kernel.js','bn1-guide.js','go.js','host-manager.js','stockmaster.js','sleeve.js',
  'hacknet-upgrade-manager.js','spend-hashes.js','gangs.js','ascend.js','corporation.js','faction-manager.js',
  'bladeburner.js','work-for-faction2.js','farm-intel.js','bin/intel-farm-state.js',
  'bin/getHackP.js','bin/getGrowThreads.js','bin/getbnmultis.js','bin/singRun.js','bin/singReadMany.js','bin/reserve.js',
  'bin/sync-script-config.js','bin/purchase.js','bin/terminate-rpc.js','bin/getBackdoorTime.js',
  'bin/getStockValue.js','bin/getGoSnapshot.js','bin/go-context.js','bin/getHacknetPayoff.js','bin/run-log.js','bin/go-stats.js',
  'bin/bribe-faction.js','infiltrate.js','bin/infiltration-control.js','bin/infiltration-locations.js',
  'Tasks/backdoor-all-servers.js','Tasks/backdoor-all-servers.js.backdoor-one.js','Tasks/contractor.js.solver.js'];
for(const file of targets) {
  const before=baseline?cost(baseline,file):null, after=cost(current,file);
  const declared=current.get(file).code.match(/ns\.ramOverride\(([\d.]+)\)/)?.[1];
  const raw=declared?cost(current,file,true):null;
  if(file==='bn1-guide.js') assert(after<=8,'The fresh-BN1 guide must still fit on 8 GB home');
  if(declared && baseline && !file.startsWith('bin/')) {
    const beforeRaw=cost(baseline,file,true);
    // Overrides may intentionally omit static-only costs (such as DOM). Preserve their prior
    // headroom and cover every new API charge, or cover the full static cost if that is lower.
    assert(Number(declared)+1e-8>=Math.min(raw,before+Math.max(0,raw-beforeRaw)), `${file}: override does not cover added API costs`);
  }
  console.log(JSON.stringify({file,before,after,...(raw===null?{}:{withoutOverride:raw,
    baselineWithoutOverride:baseline?cost(baseline,file,true):null})}));
}
