// Actual engine TSX components in React 17/MUI 5. Game state and routing are fixture-controlled.
// node .../bn1-ui.mjs /path/to/engine /tmp/bitburner-terminal-ui-check
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createBn1UI} from '../../../bn1-ui.js';
import {planBn1Augmentations, NF} from '../../../bn1-policy.js';
const engine=resolve(process.argv[2]),require=createRequire(resolve(process.argv[3],'package.json'));
const {JSDOM}=require('jsdom'),ts=require('typescript');
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','navigator','HTMLElement','Node','DocumentFragment'])
  Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true});
const React=require('react'),ReactDOM=require('react-dom'),mui=require('@mui/material'),h=React.createElement;
const {Box,Button,Paper,Typography,TextField}=mui,root=document.getElementById('root');
const icon=React.forwardRef(({sx,fontSize,...props},ref)=>h('svg',{...props,ref}));
const Settings={theme:{primary:'#00ff00',primarydark:'#008800',money:'#ffff00',rep:'#cccccc',error:'#ff0000'},
  SuppressBuyAugmentationConfirmation:false,SuppressTravelConfirmation:false,DisableASCIIArt:true,
  Locale:'en',hideTrailingDecimalZeros:false,hideThousandsSeparator:false,fractionalDigits:3,CurrencySymbol:'$',CurrencySymbolAfterValue:false};
let rerender,route,receipt='',alive=true,installCount=0,tor=false,homeRam=8,priceMultiplier=1,drainOnPurchase=false;
const installed=new Map([[NF,3]]),purchases=[],faction={name:'CyberSec',playerReputation:1000};
const Player={money:10e9,city:'Sector-12',queuedAugmentations:[],augmentations:[{name:NF,level:3}],entropy:0,
  canAfford:n=>Player.money>=n,hasAugmentation:name=>name!==NF&&Player.queuedAugmentations.some(q=>q.name===name),
  isAwareOfGang:()=>false,canAccessGrafting:()=>false,hasTorRouter:()=>tor,loseMoney:n=>Player.money-=n,
  getHomeComputer:()=>({maxRam:homeRam}),getUpgradeHomeRamCost:()=>1e6,bitNodeOptions:{},
  travel:dest=>{if(Player.money<200000)return false;Player.money-=200000;Player.city=dest;return true;}};
const Augmentations=Object.fromEntries(['BitWire','Tier 2',NF].map(name=>[name,{name,info:'Improves hacking skill.',stats:'+1% hacking',
  factions:['CyberSec'],prereqs:name==='Tier 2'?['BitWire']:[],getLevel:()=>3+Player.queuedAugmentations.filter(q=>q.name===NF).length}]));
const getAugCost=aug=>({moneyCost:(aug.name===NF?1e5:1e6)*priceMultiplier*1.9**Player.queuedAugmentations.length,repCost:1000});
const dialogBoxCreate=text=>{receipt=text;rerender();};
const purchaseAugmentation=(_faction,aug)=>{
  const cost=getAugCost(aug).moneyCost;
  assert(Player.canAfford(cost));Player.money-=cost;purchases.push(aug.name);
  Player.queuedAugmentations.push({name:aug.name,level:aug.getLevel()+1});
  if(!Settings.SuppressBuyAugmentationConfirmation)dialogBoxCreate(`You purchased ${aug.name}. Its enhancements will not take effect until they are installed.`);
  rerender();
};
class EventEmitter {listeners=[];subscribe=fn=>{this.listeners.push(fn);return()=>{};};emit=(...args)=>this.listeners.forEach(fn=>fn(...args));}
const cache=new Map();
function load(path){
  path=resolve(engine,path);if(cache.has(path))return cache.get(path);
  const source=readFileSync(path,'utf8'),output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
  const exports={};cache.set(path,exports);
  Function('require','exports',output)(specifier=>{
    if(specifier==='react'||specifier.startsWith('@mui/material'))return require(specifier);
    if(specifier.startsWith('@mui/icons-material'))return specifier==='@mui/icons-material'?new Proxy({},{get:()=>icon}):{__esModule:true,default:icon};
    if(specifier==='tss-react/mui')return {makeStyles:()=>()=>()=>({classes:{modal:'modal',paper:'paper'}})};
    if(specifier==='@player')return {Player};
    if(specifier==='@enums')return {AugmentationName:{NeuroFluxGovernor:NF},FactionName:{},CityName:{Sector12:'Sector-12',Aevum:'Aevum'}};
    if(specifier.endsWith('/Settings'))return {Settings};
    if(specifier.endsWith('/Augmentations'))return {Augmentations};
    if(specifier.endsWith('/AugmentationHelpers'))return {getAugCost,isRepeatableAug:aug=>aug.name===NF};
    if(specifier.endsWith('/FactionHelpers'))return {purchaseAugmentation};
    if(specifier.endsWith('/hooks'))return {useRerender:()=>{const[,set]=React.useState(0);return()=>set(v=>v+1);},useCycleRerender:()=>rerender};
    if(specifier.endsWith('/EventEmitter'))return {EventEmitter};
    if(specifier.endsWith('/Theme'))return {ThemeEvents:new EventEmitter()};
    if(specifier.endsWith('/DialogBox'))return {dialogBoxCreate};
    if(specifier.endsWith('/ServerHelpers'))return {getTorRouter:()=>tor=true};
    if(specifier.endsWith('/ServerPurchases'))return {purchaseRamForHomeComputer:()=>{Player.money-=1e6;homeRam*=2;}};
    if(specifier.endsWith('/Server/data/Constants'))return {ServerConstants:{HomeComputerMaxRam:1024}};
    if(specifier.endsWith('/BitNodeMultipliers'))return {currentNodeMults:{HomeComputerRamCost:1}};
    if(specifier.endsWith('MathNotation.json'))return {HomeRAMCost:{}};
    if(specifier.endsWith('/MathNotationOutput'))return {MathNotationOutput:()=>null};
    if(specifier.endsWith('/Constants'))return {CONSTANTS:{TorRouterCost:200000,TravelCost:200000}};
    if(specifier.endsWith('/ExportBonus'))return {canGetBonus:()=>false};
    if(specifier.endsWith('/GameRoot'))return {Router:{toPage:p=>route(p)}};
    if(specifier.endsWith('/Router'))return {Page:{City:'City'}};
    if(specifier.endsWith('/AlertManager'))return {AlertEvents:new EventEmitter()};
    for(const name of ['InstalledAugmentations','PlayerMultipliers','SourceFilesElement'])
      if(specifier.endsWith('/'+(name==='SourceFilesElement'?'SourceFiles':name)))return {[name]:()=>null};
    if(specifier.endsWith('/WorldMap'))return {WorldMap:({onTravel})=>h(TravelPoint,{city:'Aevum',onTravel})};
    return load(resolve(path,'..',specifier)+(/\.[jt]sx?$/.test(specifier)?'':specifier.endsWith('formatNumber')?'.ts':'.tsx'));
  },exports);return exports;
}
const formats=load('src/ui/formatNumber.ts');formats.FormatsNeedToChange.emit();
const {Modal}=load('src/ui/React/Modal.tsx'),{PurchasableAugmentation}=load('src/Augmentation/ui/PurchasableAugmentations.tsx'),
  {AugmentationsRoot}=load('src/Augmentation/ui/AugmentationsRoot.tsx'),{TorButton}=load('src/Locations/ui/TorButton.tsx'),
  {RamButton}=load('src/Locations/ui/RamButton.tsx'),{TravelAgencyRoot}=load('src/Locations/ui/TravelAgencyRoot.tsx');
function TravelPoint({city,onTravel}){return h('span',{onClick:()=>onTravel(city)},'A');}
function FactionView({faction}){
  const parent={faction,rep:faction.playerReputation,rerender,
    canPurchase:aug=>Player.canAfford(getAugCost(aug).moneyCost)&&faction.playerReputation>=1000&&aug.prereqs.every(n=>Player.hasAugmentation(n)),
    purchaseAugmentation:(aug,show)=>{if(drainOnPurchase)priceMultiplier*=10;if(Settings.SuppressBuyAugmentationConfirmation)purchaseAugmentation(faction,aug);else show(true);}};
  return h(React.Fragment,null,h(Typography,{variant:'h4'},'Faction Augmentations - '+faction.name),
    h(TextField,{value:'',onChange(){}}),...Object.values(Augmentations).map(aug=>h(PurchasableAugmentation,
      {key:aug.name,parent,augName:aug.name,owned:Player.hasAugmentation(aug.name)})));
}
function App(){
  const[page,setPage]=React.useState('Terminal'),[,update]=React.useState(0);
  rerender=()=>update(v=>v+1);route=page=>setTimeout(()=>setPage(page),150);
  const install=()=>{installCount++;alive=false;};
  return h(React.Fragment,null,...['Terminal','Factions','Augmentations','Travel','City'].map(name=>h('div',{key:name,role:'button',onClick:()=>route(name)},name)),
    page==='Terminal'?h('input',{id:'terminal-input'}):page==='Augmentations'?h(AugmentationsRoot,{installAugmentationsFn:install,exportGameFn(){}}):
    page==='Factions'?h('span',{className:'factions-joined'},h(Paper,null,h(Typography,{variant:'h6'},'CyberSec'),h(Button,{onClick:()=>route('Faction')},'Augments'))):
    page==='Faction'?h(FactionView,{faction}):page==='Travel'?h(TravelAgencyRoot):
    page==='City'?h(React.Fragment,null,h(Typography,null,Player.city),h('span',{'aria-label':'NetLink Technologies',onClick:()=>route('Shop')},'shop')):
    page==='Shop'?h(React.Fragment,null,h(TorButton,{rerender}),h(RamButton,{rerender})):null,
    h(Modal,{open:!!receipt,onClose:()=>{receipt='';rerender();}},receipt==='INVITE'?h(React.Fragment,null,h(Typography,{variant:'h4'},'You received a faction invitation.'),h(Button,{onClick:()=>{throw Error('Do not join through popup');}},'Join'),h(Button,{onClick:()=>{receipt='';rerender();}},'Decide later')):h(React.Fragment,null,h(Typography,null,receipt),h(Button,{onClick:()=>{receipt='';rerender();}},'OK'))));
}
const ns={getPlayer:()=>({money:Player.money,city:Player.city,factions:['CyberSec']}),getResetInfo:()=>({ownedAugs:installed}),
  getServer:()=>({maxRam:homeRam}),hasTorRouter:()=>tor,sleep:ms=>new Promise(r=>setTimeout(r,ms)),tprint(){}};
const ui=createBn1UI(ns,document,()=>alive);
for(const suppress of [false,true]){
  ReactDOM.unmountComponentAtNode(root);Player.queuedAugmentations=[];Player.money=10e9;Player.city='Sector-12';
  receipt='';alive=true;tor=false;homeRam=8;priceMultiplier=1;drainOnPurchase=false;
  Settings.SuppressBuyAugmentationConfirmation=suppress;Settings.SuppressTravelConfirmation=suppress;Settings.DisableASCIIArt=suppress;
  ReactDOM.render(h(App),root);await ns.sleep(50);
  await ui.travel('Aevum');assert.equal(Player.city,'Aevum');
  assert(await ui.store('tor',()=>Player.money));assert(tor);
  assert(await ui.store('ram',()=>Player.money));assert.equal(homeRam,16);
  assert.deepEqual(await ui.queue(),[]);
  const snapshot=await ui.snapshot();assert.equal(snapshot.rows.length,3);
  const bitwire=snapshot.rows.find(r=>r.name==='BitWire');assert(bitwire.repMet);assert(bitwire.description.includes('hacking'));
  assert(snapshot.rows.find(r=>r.name==='Tier 2').missingPrereqs);
  assert.equal(planBn1Augmentations({...snapshot,installed:[NF],money:Player.money}).bundle[0].name,'BitWire');
  assert(await ui.buy(bitwire,()=>Player.money));assert.deepEqual(await ui.queue(),[{name:'BitWire',levels:1}]);
  let fresh=await ui.snapshot();assert(!fresh.rows.find(r=>r.name==='Tier 2').missingPrereqs);
  assert(await ui.buy(fresh.rows.find(r=>r.name===NF),()=>Player.money));
  assert.deepEqual(await ui.queue(),[{name:'BitWire',levels:1},{name:NF,levels:1}]);
  if(!suppress){
    fresh=await ui.snapshot();drainOnPurchase=true;
    await assert.rejects(ui.buy(fresh.rows.find(r=>r.name==='Tier 2'),()=>Player.money),/price\/budget changed/);
    drainOnPurchase=false;route('Terminal');await ns.sleep(300);
  }
  let verified=0;
  try{await ui.install(async()=>verified++);}catch(error){assert(!alive&&/stopped/.test(String(error)));}
  assert.equal(verified,suppress?1:2);assert(!alive);
}
assert.equal(installCount,2);
ReactDOM.unmountComponentAtNode(root);alive=true;receipt='';ReactDOM.render(h(App),root);await ns.sleep(50);
receipt='INVITE';rerender();await ns.sleep(50);await ui.queue();assert.equal(receipt,'');await ns.sleep(300);
receipt='Unexpected dialog';rerender();await ns.sleep(50);await assert.rejects(ui.queue(),/dialog needs your attention/);
receipt='';rerender();await ns.sleep(300);alive=false;await assert.rejects(ui.queue(),/stopped/);
ReactDOM.unmountComponentAtNode(root);dom.window.close();
console.log('Official TSX + React/MUI: travel (ASCII/list and confirmations), TOR/RAM purchases, faction row requirements/descriptions/prerequisites, queued NF levels, price-race refusal, both install-confirmation settings, delayed navigation, popup deferral, unrelated dialogs, and cancellation pass.');
process.exit(0);
