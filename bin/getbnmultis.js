/** @param {NS} ns */
export async function main(ns) {
  const port = ns.getPortHandle(ns.pid)
  let mults;
  try {
    mults = ns.getBitNodeMultipliers()
  }
  catch {
    const resetInfo = ns.getResetInfo()
    mults = Object.fromEntries(Object.entries({
      AgilityLevelMultiplier: /*     */[1, 1, 1, 1, 1, 1, 1, 1, 0.45, 0.4, 1, 1, 0.7, 0.5, 0.7],
      AugmentationMoneyCost: /*      */[1, 1, 3, 1, 2, 1, 3, 1, 1, 5, 2, 1, 1, 1.5, 3],
      AugmentationRepCost: /*        */[1, 1, 3, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1],
      BladeburnerRank: /*            */[1, 1, 1, 1, 1, 1, 0.6, 0, 0.9, 0.8, 1, 1, 0.45, 0.6, 0.2],
      BladeburnerSkillCost: /*       */[1, 1, 1, 1, 1, 1, 2, 1, 1.2, 1, 1, 1, 2, 2, 3],
      CharismaLevelMultiplier: /*    */[1, 1, 1, 1, 1, 1, 1, 1, 0.45, 0.4, 1, 1, 1, 1, 1.1],
      ClassGymExpGain: /*            */[1, 1, 1, 0.5, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 1, 1],
      CodingContractMoney: /*        */[1, 1, 1, 1, 1, 1, 1, 0, 1, 0.5, 0.25, 1, 0.4, 1, 1],
      CompanyWorkExpGain: /*         */[1, 1, 1, 0.5, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 1, 1],
      CompanyWorkMoney: /*           */[1, 1, 0.25, 0.1, 1, 0.5, 0.5, 0, 1, 0.5, 0.5, 1, 0.4, 1, 1],
      CompanyWorkRepGain: /*         */[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.2, 1],
      CorporationDivisions: /*       */[1, 0.9, 1, 1, 0.75, 0.8, 0.8, 0, 0.8, 0.9, 0.9, 0.5, 0.4, 0.8, 0.4],
      CorporationSoftcap: /*         */[1, 0.9, 1, 1, 1, 0.9, 0.9, 0, 0.75, 0.9, 0.9, 0.8, 0.4, 0.9, 0.4],
      CorporationValuation: /*       */[1, 1, 1, 1, 0.75, 0.2, 0.2, 0, 0.5, 0.5, 0.1, 1, 0.001, 0.4, 0.2],
      CrimeExpGain: /*               */[1, 1, 1, 0.5, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 1, 1],
      CrimeMoney: /*                 */[1, 3, 0.25, 0.2, 0.5, 0.75, 0.75, 0, 0.5, 0.5, 3, 1, 0.4, 0.75, 1],
      CrimeSuccessRate: /*           */[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.4, 1],
      DaedalusAugsRequirement: /*    */[30, 30, 30, 30, 30, 35, 35, 30, 30, 30, 30, 31, 30, 30, 20],
      DefenseLevelMultiplier: /*     */[1, 1, 1, 1, 1, 1, 1, 1, 0.45, 0.4, 1, 1, 0.7, 1, 0.7],
      DexterityLevelMultiplier: /*   */[1, 1, 1, 1, 1, 1, 1, 1, 0.45, 0.4, 1, 1, 0.7, 0.5, 0.7],
      FactionPassiveRepGain: /*      */[1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      FactionWorkExpGain: /*         */[1, 1, 1, 0.5, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 1, 1],
      FactionWorkRepGain: /*         */[1, 0.5, 1, 0.75, 1, 1, 1, 1, 1, 1, 1, 1, 0.6, 0.2, 1],
      FourSigmaMarketDataApiCost: /* */[1, 1, 1, 1, 1, 1, 2, 1, 4, 1, 4, 1, 10, 1, 1],
      FourSigmaMarketDataCost: /*    */[1, 1, 1, 1, 1, 1, 2, 1, 5, 1, 4, 1, 10, 1, 1],
      GangSoftcap: /*                */[1, 1, 0.9, 1, 1, 0.7, 0.7, 0, 0.8, 0.9, 1, 0.8, 0.3, 0.7, 1],
      GangUniqueAugs: /*             */[1, 1, 0.5, 0.5, 0.5, 0.2, 0.2, 0, 0.25, 0.25, 0.75, 1, 0.1, 0.4, 0.3],
      GoPower: /*                    */[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 1],
      HackExpGain: /*                */[1, 1, 1, 0.4, 0.5, 0.25, 0.25, 1, 0.05, 1, 0.5, 1, 0.1, 1, 1],
      HackingLevelMultiplier: /*     */[1, 0.8, 0.8, 1, 1, 0.35, 0.35, 1, 0.5, 0.35, 0.6, 1, 0.25, 0.4, 0.6],
      HackingSpeedMultiplier: /*     */[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.3, 0.6],
      HacknetNodeMoney: /*           */[1, 1, 0.25, 0.05, 0.2, 0.2, 0.2, 0, 1, 0.5, 0.1, 1, 0.4, 0.25, 1],
      HomeComputerRamCost: /*        */[1, 1, 1.5, 1, 1, 1, 1, 1, 5, 1.5, 1, 1, 1, 1, 1],
      InfiltrationMoney: /*          */[1, 3, 1, 1, 1.5, 0.75, 0.75, 0, 1, 0.5, 2.5, 1, 1, 0.75, 1],
      InfiltrationRep: /*            */[1, 1, 1, 1, 1.5, 1, 1, 1, 1, 1, 2.5, 1, 1, 1, 1],
      ManualHackMoney: /*            */[1, 1, 1, 1, 1, 1, 1, 0, 1, 0.5, 1, 1, 1, 1, 1],
      CloudServerCost: /*        */[1, 1, 2, 1, 1, 1, 1, 1, 1, 5, 1, 1, 1, 1, 1],
      CloudServerSoftcap: /*     */[1, 1.3, 1.3, 1.2, 1.2, 2, 2, 4, 1, 1.1, 2, 1, 1.6, 1, 1],
      CloudServerLimit: /*       */[1, 1, 1, 1, 1, 1, 1, 1, 0, 0.6, 1, 1, 1, 1, 1],
      CloudServerMaxRam: /*      */[1, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 1, 1, 1, 1, 1],
      FavorToDonateToFaction: /*       */[1, 1, 0.5, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1],
      ScriptHackMoney: /*            */[1, 1, 0.2, 0.2, 0.15, 0.75, 0.5, 0.3, 0.1, 0.5, 1, 1, 0.2, 0.3, 1],
      ScriptHackMoneyGain: /*        */[1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1],
      ServerGrowthRate: /*           */[1, 0.8, 0.2, 1, 1, 1, 1, 1, 1, 1, 0.2, 1, 1, 1, 1],
      ServerMaxMoney: /*             */[1, 0.08, 0.04, 0.1125, 1, 0.2, 0.2, 1, 0.01, 1, 0.01, 1, 0.3375, 0.7, 0.8],
      ServerStartingMoney: /*        */[1, 0.4, 0.2, 0.75, 0.5, 0.5, 0.5, 1, 0.1, 1, 0.1, 1, 0.75, 0.5, 0.5],
      ServerStartingSecurity: /*     */[1, 1, 1, 1, 2, 1.5, 1.5, 1, 2.5, 1, 1, 1.5, 3, 1.5, 1.5],
      ServerWeakenRate: /*           */[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1],
      StrengthLevelMultiplier: /*    */[1, 1, 1, 1, 1, 1, 1, 1, 0.45, 0.4, 1, 1, 0.7, 0.5, 0.7],
      StaneksGiftPowerMultiplier: /* */[1, 2, 0.75, 1.5, 1.3, 0.5, 0.9, 1, 0.5, 0.75, 1, 1, 2, 0.5, 0.7],
      StaneksGiftExtraSize: /*       */[0, -6, -2, 0, 0, 2, -1, -99, 2, -3, 0, 1, 1, -1, -2],
      WorldDaemonDifficulty: /*      */[1, 5, 2, 3, 1.5, 2, 2, 1, 2, 2, 1.5, 1, 3, 5, 2]
    }).map(([mult, values]) => [mult, values[resetInfo.currentNode - 1]]));
  }
  ns.atExit(() => port.write(mults))
}
