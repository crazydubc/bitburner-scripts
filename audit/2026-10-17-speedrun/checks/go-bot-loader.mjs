// Replace only Netscript transport/configuration for offline execution of the actual bot.
export async function loadGoBot(source, normalizeBaselineFormatting = false) {
  const transport = `
const getConfiguration=ns=>({runOnce:true,cheats:false,'disable-cheats':true,'cheat-chance-threshold':0.9,...ns.audit.options});
const log=(ns,message)=>ns.audit.log(message), getErrorInfo=String, getActiveSourceFiles=async ns=>ns.audit.sourceFiles??{};
const whichServerIsRunning=async()=>['home',1], disableLogs=()=>{};
const getBoard=async ns=>ns.audit.board(), getControlledENodes=async ns=>ns.audit.controlled();
const getReset=async ns=>ns.audit.reset??{}, recordGoResult=async(ns,result)=>ns.audit.record?.(result);
const getGoSnapshot=async ns=>({board:ns.audit.board(),controlled:ns.audit.controlled(),valid:ns.audit.valid(),
  liberties:ns.audit.liberties(),chains:ns.audit.chains()});
const goMove=async(ns,x,y)=>ns.audit.play(x,y), goValidMoves=async ns=>ns.audit.valid();
const goLiberties=async ns=>ns.audit.liberties(), goChains=async ns=>ns.audit.chains();
const goCheatChance=async()=>0, play2Moves=()=>{throw Error('cheats disabled')}, destroyND=play2Moves;
`;
  source = source.replace(/import \{[\s\S]*?\} from '\.\/utils.js'/, transport)
    .replace("'./go-tactics.js'", JSON.stringify(new URL('./go-tactics-model.mjs', import.meta.url).href));
  // Benchmark the baseline strategy without counting its undefined sprintf as a strategic loss.
  if (normalizeBaselineFormatting) source = 'const sprintf=()=>"pattern";\n' + source;
  return (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).main;
}
