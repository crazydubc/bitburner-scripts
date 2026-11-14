// Test adapter for an external, unmodified official game checkout. Node >=24.
// Real Go rules, scoring, patterns, and opponent AI; only UI/player rewards and sleep are stubbed.
import {registerHooks, stripTypeScriptTypes} from 'node:module';
import {readFileSync, existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export async function loadGoEngine(enginePath) {
  const root = resolve(enginePath);
  const uri = file => pathToFileURL(resolve(root, file)).href;
  const stubs = {
    enums: `export * from ${JSON.stringify(uri('src/Go/Enums.ts'))};
      export const AugmentationName={TheRedPill:'The Red Pill'};
      export const FactionName={Illuminati:'Illuminati'};`,
    player: `export const Player={totalPlaytime:1, bitNodeN:1, factions:[], entropy:0,
      activeSourceFileLvl:()=>0, hasAugmentation:()=>false, giveAchievement(){}, applyEntropy(){}};`,
    go: `export const getEmptyHighlightedPoints=(size=7)=>Array.from({length:size},()=>Array(size).fill(null));
      export const Go={currentGame:null,previousGame:null,stats:{},storedCycles:0};
      export const GoEvents={emit(){}};`,
    utility: 'export const sleep=async()=>{};',
    effects: 'export const getDifficultyMultiplier=()=>1, getWinstreakMultiplier=()=>1, getMaxRep=()=>0;',
    factions: 'export const Factions={};',
    enumHelper: 'export const getEnumHelper=()=>({getMember:name=>name});',
    favor: 'export const addRepToFavor=(favor)=>favor;',
    alert: 'export const exceptionAlert=error=>{throw error};',
  };
  const replacements = new Map([
    ['src/Go/Go.ts', 'go'], ['src/utils/Utility.ts', 'utility'],
    ['src/Go/effects/effect.ts', 'effects'], ['src/Faction/Factions.ts', 'factions'],
    ['src/utils/EnumHelper.ts', 'enumHelper'], ['src/Faction/formulas/favor.ts', 'favor'],
    ['src/utils/helpers/exceptionAlert.ts', 'alert'],
  ].map(([file, name]) => [resolve(root, file), name]));
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === '@enums') return {url:'goaudit:enums', shortCircuit:true};
      if (specifier === '@player') return {url:'goaudit:player', shortCircuit:true};
      if (specifier.startsWith('.') && context.parentURL?.startsWith(pathToFileURL(root).href)) {
        let path = resolve(dirname(fileURLToPath(context.parentURL)), specifier);
        if (!existsSync(path) && existsSync(path + '.ts')) path += '.ts';
        const stub = replacements.get(path) ?? replacements.get(path + '.ts');
        return {url:stub ? `goaudit:${stub}` : pathToFileURL(path).href, shortCircuit:true};
      }
      return next(specifier, context);
    },
    load(url, context, next) {
      if (url.startsWith('goaudit:')) return {format:'module', source:stubs[url.slice(8)], shortCircuit:true};
      if (url.startsWith(pathToFileURL(root).href) && url.endsWith('.ts')) {
        // boardState's import predates import-type syntax. These are interfaces, not runtime values.
        const source = readFileSync(fileURLToPath(url), 'utf8')
          .replace(/import \{ Board, BoardState, Move, Neighbor, PointState, SimpleBoard \} from "\.\.\/Types";/,
            'import type { Board, BoardState, Move, Neighbor, PointState, SimpleBoard } from "../Types";');
        return {format:'module', source:stripTypeScriptTypes(source, {mode:'transform'}), shortCircuit:true};
      }
      return next(url, context);
    },
  });
  const [state, analysis, ai, scoring, enums, {Go}] = await Promise.all([
    import(uri('src/Go/boardState/boardState.ts')), import(uri('src/Go/boardAnalysis/boardAnalysis.ts')),
    import(uri('src/Go/boardAnalysis/goAI.ts')), import(uri('src/Go/boardAnalysis/scoring.ts')),
    import(uri('src/Go/Enums.ts')), import('goaudit:go'),
  ]);
  const {Player} = await import('goaudit:player');
  return {...state, ...analysis, ...ai, ...scoring, ...enums, Go, Player};
}
