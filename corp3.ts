import { CorpState, DivisionName, DivisionResearches, EmployeePosition, IndustryType, MaterialOrder, OfficeSetup, 
UnlockName, UpgradeName, cities, CityName, 
ResearchName} from "./corpconsts";
import { BalancingModifierForProfitProgress, CorporationOptimizer, OfficeBenchmarkSortType, 
StorageFactoryBenchmarkData, 
assignJobs, budgetRatioForProductDivisionWithoutAdvert, buyAdvert, buyBoostMaterials, buyUnlock, 
buyUpgrade, createDummyDivisions, defaultBudgetRatioForProductDivision, defaultBudgetRatioForSupportDivision, 
defaultPerformanceModifierForOfficeBenchmark, developNewProduct, generateOfficeSetups, getDivisionResearches, 
getGenericMaxAffordableUpgradeLevel, getMaxAffordableAdVertLevel, getMaxAffordableUpgradeLevel, 
getMaxAffordableWarehouseLevel, getOptimalBoostMaterialQuantities, getProductMarketPrice, getProfit, 
optimizeOffice, precalculatedEmployeeRatioForProductDivisionRound3, 
precalculatedEmployeeRatioForProductDivisionRound4, precalculatedEmployeeRatioForProductDivisionRound5_1, 
precalculatedEmployeeRatioForProductDivisionRound5_2, precalculatedEmployeeRatioForProfitSetupOfRound3, 
precalculatedEmployeeRatioForProfitSetupOfRound4, 
precalculatedEmployeeRatioForSupportDivisions, sampleProductName, thresholdOfFocusingOnAdvert, upgradeOffices, 
upgradeWarehouse } from "./corporationOptimizer";
import { ResearchPriority, clearPurchaseOrders, getProductIdArray, researchPrioritiesForProductDivision, 
researchPrioritiesForSupportDivision, stockMaterials, waitForNextTimeStateHappens, waitForNumberOfCycles, 
waitUntilAfterStateHappens} from "./corputils";
import { log } from "./helpers";

const corpName = "ShadyEnt";
let agricultureIndustryData: CorpIndustryData;
let chemicalIndustryData: CorpIndustryData;
let tobaccoIndustryData: CorpIndustryData;
let config: { [key: string]: string[] | ScriptArg; };
let mainProductDevelopmentCity: CityName;
let supportProductDevelopmentCities: CityName[];
export const exportString = "(IPROD+IINV/10)*(-1)";
const officeUpgradeBasePrice = 4e9;

const usePrecalculatedEmployeeRatioForProductDivision = true;
const maxRerunWhenOptimizingOfficeForProductDivision = 0;
const usePrecalculatedEmployeeRatioForSupportDivisions = true;
const usePrecalculatedEmployeeRatioForProfitSetup = true;
const maxNumberOfProductsInRound3 = 1;
const maxNumberOfProductsInRound4 = 2;
let budgetRatioForProductDivision = defaultBudgetRatioForProductDivision;


const defaultConfig: [string, string | number | boolean | string[]][] = [
  ["benchmark", false],
  ["auto", true],
  ["selfFund", false],
  ["round1", true],
  ["round2", false],
  ["round3", false],
  ["improveAllDivisions", false],
  ["test", false],
  ["help", false],
];

export enum MaterialName {
    MINERALS = "Minerals",
    ORE = "Ore",
    WATER = "Water",
    FOOD = "Food",
    PLANTS = "Plants",
    METAL = "Metal",
    HARDWARE = "Hardware",
    CHEMICALS = "Chemicals",
    DRUGS = "Drugs",
    ROBOTS = "Robots",
    AI_CORES = "AI Cores",
    REAL_ESTATE = "Real Estate"
}

interface Round1Option {
    agricultureOfficeSize: number;
    waitForAgricultureRP: number;
    boostMaterialsRatio: number;
}

let valuation: number;

const PrecalculatedRound1Option = {
    // 1498 - 61.344e9 - 504.8e9 - 443.456e9 - 4.89m/s - 17.604b/h
    OPTION1: <Round1Option>{
        agricultureOfficeSize: 3,
        waitForAgricultureRP: 55,
        boostMaterialsRatio: 0.89
        // boostMaterialsRatio: 0.88 // Smart Supply - Advert 1
    },
    // 1649 - 51.46e9 - 557.1e9 - 505.64e9 - 5.381e6/s - 19.371/h
    OPTION2: <Round1Option>{
        agricultureOfficeSize: 4,
        waitForAgricultureRP: 55,
        boostMaterialsRatio: 0.86
        // boostMaterialsRatio: 0.84 // Smart Supply
    },
    // 1588 - 42.704e9 - 536.8e9 - 494.096e9 - 5.176m/s - 18.633b/h
    OPTION3: <Round1Option>{
        agricultureOfficeSize: 5,
        waitForAgricultureRP: 55,
        boostMaterialsRatio: 0.84
    },
    // 1441 - 34.13e9 - 487.5e9 - 453.37e9 - 4.694m/s - 16.898b/h
    OPTION4: <Round1Option>{
        agricultureOfficeSize: 6,
        waitForAgricultureRP: 55,
        boostMaterialsRatio: 0.815
    },
} as const;

interface Round2Option {
    agricultureOfficeSize: number;
    increaseBusiness: boolean;
    waitForAgricultureRP: number;
    waitForChemicalRP: number;
    agricultureBoostMaterialsRatio: number;
}

const PrecalculatedRound2Option = {
    // 15.266e12 17282 804.175
    OPTION1: <Round2Option>{
        agricultureOfficeSize: 8, // 3-1-1-3
        increaseBusiness: false,
        waitForAgricultureRP: 903,
        waitForChemicalRP: 516,
        agricultureBoostMaterialsRatio: 0.75
    },
    // 14.57e12 16485 815.188
    OPTION2: <Round2Option>{
        agricultureOfficeSize: 8,
        increaseBusiness: true,
        waitForAgricultureRP: 703,
        waitForChemicalRP: 393,
        agricultureBoostMaterialsRatio: 0.76
    },
    // 14.474e12
    OPTION3: <Round2Option>{
        agricultureOfficeSize: 8,
        increaseBusiness: true,
        waitForAgricultureRP: 653,
        waitForChemicalRP: 362,
        agricultureBoostMaterialsRatio: 0.755
    },
    // 13.994e12
    OPTION4: <Round2Option>{
        agricultureOfficeSize: 8,
        increaseBusiness: true,
        waitForAgricultureRP: 602,
        waitForChemicalRP: 331,
        agricultureBoostMaterialsRatio: 0.74
    },
    // 13.742e12
    OPTION5: <Round2Option>{
        agricultureOfficeSize: 8, // 2-1-3-2
        increaseBusiness: true,
        waitForAgricultureRP: 602,
        waitForChemicalRP: 331,
        agricultureBoostMaterialsRatio: 0.77
    },
    // 13.425e12
    OPTION6: <Round2Option>{
        agricultureOfficeSize: 8,
        increaseBusiness: true,
        waitForAgricultureRP: 551,
        waitForChemicalRP: 300,
        agricultureBoostMaterialsRatio: 0.71
    },
    // 13.7e12
    OPTION7: <Round2Option>{
        agricultureOfficeSize: 8, // 2-1-3-2
        increaseBusiness: true,
        waitForAgricultureRP: 551,
        waitForChemicalRP: 300,
        agricultureBoostMaterialsRatio: 0.77
    },
    // 13.6e12
    OPTION8: <Round2Option>{
        agricultureOfficeSize: 8, // 2-1-3-2
        increaseBusiness: true,
        waitForAgricultureRP: 500,
        waitForChemicalRP: 269,
        agricultureBoostMaterialsRatio: 0.77
    },
    // 13e12
    OPTION9: <Round2Option>{
        agricultureOfficeSize: 8, // 2-1-3-2
        increaseBusiness: true,
        waitForAgricultureRP: 450,
        waitForChemicalRP: 238,
        agricultureBoostMaterialsRatio: 0.73
    },
    // 10.884e12
    OPTION10: <Round2Option>{
        agricultureOfficeSize: 8, // 2-1-3-2
        increaseBusiness: true,
        waitForAgricultureRP: 302,
        waitForChemicalRP: 148,
        agricultureBoostMaterialsRatio: 0.61
    }
} as const;

interface Round3Option {
}

const PrecalculatedRound3Option = {
    OPTION1: <Round3Option>{},
} as const;

/** @param {NS} ns **/
export async function main(ns: NS): Promise<void> {
  let selfFund = ns.getResetInfo().currentNode !== 3;
  
  let pid = 0;
  if (!ns.corporation.hasCorporation()) {
    if (!ns.corporation.canCreateCorporation(selfFund)) return;
    if (!ns.corporation.createCorporation(corpName, selfFund)) {
      const spendHashesArgs = ["--liquidate", "--spend-on", 'Sell for Money'];
      pid = ns.run('spend-hacknet-hashes.js', 1, ...spendHashesArgs);
      while (!ns.corporation.createCorporation(corpName, selfFund)) {
        //logOnce(ns, `Awaiting corporation creation..`, true, 'info');
        await ns.sleep(5000);
      }
    }
  }
  agricultureIndustryData = ns.corporation.getIndustryData(IndustryType.AGRICULTURE);
  chemicalIndustryData = ns.corporation.getIndustryData(IndustryType.CHEMICAL);
  tobaccoIndustryData = ns.corporation.getIndustryData(IndustryType.TOBACCO);

  mainProductDevelopmentCity = ns.enums.CityName.Sector12;
  supportProductDevelopmentCities = Object.values(ns.enums.CityName)
        .filter(cityName => cityName !== mainProductDevelopmentCity);

  config = ns.flags(defaultConfig);
  await ns.sleep(1000);
  if (pid) ns.kill(pid);
  pid = ns.run('spend-hacknet-hashes.js', 1, ...["--liquidate", "--spend-on", "Sell for Corporation Funds", "--spend-on", "Exchange for Corporation Research"]);
  if (ns.corporation.getCorporation().numShares >= 1_000_000_000) {
    await round1(ns);
  }
  else if (ns.corporation.getCorporation().numShares >= 800_000_000) {
    await round2(ns);
  }
  else if (ns.corporation.getCorporation().numShares >= 700_000_000) {
    await round3(ns);
  }
  await improveAllDivisions(ns);
  if (pid) ns.kill(pid);
  clearPurchaseOrders(ns, false);
}

async function round1(ns: NS, option: Round1Option = PrecalculatedRound1Option.OPTION2): Promise<void> {
  
    log(ns, `Executing round 1 offer.`, true, 'info');
    // Create Agriculture division
    await createDivision(ns, DivisionName.AGRICULTURE, option.agricultureOfficeSize, 1);
    for (const city of cities) {
        ns.corporation.sellMaterial(DivisionName.AGRICULTURE, city, MaterialName.PLANTS, "MAX", "MP");
        ns.corporation.sellMaterial(DivisionName.AGRICULTURE, city, MaterialName.FOOD, "MAX", "MP");
    }
    
    await buyTeaAndThrowParty(ns, DivisionName.AGRICULTURE);
    buyAdvert(ns, DivisionName.AGRICULTURE, 2);

    let dataArray: StorageFactoryBenchmarkData[];
    do {
      dataArray = new CorporationOptimizer().optimizeStorageAndFactory(ns,
        agricultureIndustryData,
        ns.corporation.getUpgradeLevel(UpgradeName.SMART_STORAGE),
        // Assume that all warehouses are at the same level
        ns.corporation.getWarehouse(DivisionName.AGRICULTURE, CityName.Sector12).level,
        ns.corporation.getUpgradeLevel(UpgradeName.SMART_FACTORIES),
        getDivisionResearches(ns, DivisionName.AGRICULTURE),
        ns.corporation.getCorporation().funds,
        false
      );
      await ns.sleep(1000);
    }while (dataArray.length === 0);

    const optimalData = dataArray[dataArray.length - 1];
    
    buyUpgrade(ns, UpgradeName.SMART_STORAGE, optimalData.smartStorageLevel);
    buyUpgrade(ns, UpgradeName.SMART_FACTORIES, optimalData.smartFactoriesLevel);
    for (const city of cities) {
        upgradeWarehouse(ns, DivisionName.AGRICULTURE, city, optimalData.warehouseLevel);
    }
    
    assignJobs(
        ns,
        DivisionName.AGRICULTURE,
        generateOfficeSetupsForEarlyRounds(
            option.agricultureOfficeSize,
            false
        )
    );

    const optimalAmountOfBoostMaterials = await findOptimalAmountOfBoostMaterials(
        ns,
        DivisionName.AGRICULTURE,
        agricultureIndustryData,
        CityName.Sector12,
        true,
        option.boostMaterialsRatio
    );
    
    await stockMaterials(
        ns,
        DivisionName.AGRICULTURE,
        generateMaterialsOrders(
            cities,
            [
                { name: MaterialName.AI_CORES, count: optimalAmountOfBoostMaterials[0] },
                { name: MaterialName.HARDWARE, count: optimalAmountOfBoostMaterials[1] },
                { name: MaterialName.REAL_ESTATE, count: optimalAmountOfBoostMaterials[2] },
                { name: MaterialName.ROBOTS, count: optimalAmountOfBoostMaterials[3] }
            ]
        )
    );
      await waitForOffer(ns, 10, 10, 490e9);
      ns.corporation.acceptInvestmentOffer();
      while (ns.corporation.getCorporation().funds < 150_000_000_000) {
        await ns.sleep(2000);
      }
      await round2(ns);
}

async function round2(ns: NS, option: Round2Option = PrecalculatedRound2Option.OPTION2): Promise<void> {
  log(ns, `Executing round 2 offer.`, true, 'info');
    await buyUnlock(ns, UnlockName.EXPORT);

    // Upgrade Agriculture
    log(ns, `Upgrade Agriculture division.`, true, 'info');
    upgradeOffices(
        ns,
        DivisionName.AGRICULTURE,
        generateOfficeSetups(
            cities,
            option.agricultureOfficeSize,
            [
                { name: EmployeePosition.RESEARCH_DEVELOPMENT, count: option.agricultureOfficeSize }
            ]
        )
    );

    // Create Chemical division
    await createDivision(ns, DivisionName.CHEMICAL, 3, 2);
    // Import materials, sell/export produced materials
    for (const city of cities) {
        // Export Plants from Agriculture to Chemical
        ns.corporation.cancelExportMaterial(DivisionName.AGRICULTURE, city, DivisionName.CHEMICAL, city, "Plants");
        ns.corporation.exportMaterial(DivisionName.AGRICULTURE, city, DivisionName.CHEMICAL, city, "Plants", exportString);

        // Export Chemicals from Chemical to Agriculture
        ns.corporation.cancelExportMaterial(DivisionName.CHEMICAL, city, DivisionName.AGRICULTURE, city, "Chemicals");
        ns.corporation.exportMaterial(DivisionName.CHEMICAL, city, DivisionName.AGRICULTURE, city, "Chemicals", exportString);
        // Sell Chemicals
        ns.corporation.sellMaterial(DivisionName.CHEMICAL, city, MaterialName.CHEMICALS, "MAX", "MP");
    }

    await buyTeaAndThrowParty(ns, DivisionName.AGRICULTURE);
    await buyTeaAndThrowParty(ns, DivisionName.CHEMICAL);

    buyAdvert(ns, DivisionName.AGRICULTURE, 8);

    const dataArray = new CorporationOptimizer().optimizeStorageAndFactory(ns,
        agricultureIndustryData,
        ns.corporation.getUpgradeLevel(UpgradeName.SMART_STORAGE),
        // Assume that all warehouses are at the same level
        ns.corporation.getWarehouse(DivisionName.AGRICULTURE, CityName.Sector12).level,
        ns.corporation.getUpgradeLevel(UpgradeName.SMART_FACTORIES),
        getDivisionResearches(ns, DivisionName.AGRICULTURE),
        ns.corporation.getCorporation().funds,
        false
    );
    if (dataArray.length === 0) {
        throw new Error("Cannot find optimal data");
    }
    const optimalData = dataArray[dataArray.length - 1];

    buyUpgrade(ns, UpgradeName.SMART_STORAGE, optimalData.smartStorageLevel);
    buyUpgrade(ns, UpgradeName.SMART_FACTORIES, optimalData.smartFactoriesLevel);
    for (const city of cities) {
        upgradeWarehouse(ns, DivisionName.AGRICULTURE, city, optimalData.warehouseLevel);
    }

    /*await waitUntilHavingEnoughResearchPoints(
        ns,
        [
            {
                divisionName: DivisionName.AGRICULTURE,
                researchPoint: option.waitForAgricultureRP
            },
            {
                divisionName: DivisionName.CHEMICAL,
                researchPoint: option.waitForChemicalRP
            }
        ]
    );*/

    buyAdvert(
        ns,
        DivisionName.AGRICULTURE,
        getMaxAffordableAdVertLevel(ns,
            ns.corporation.getHireAdVertCount(DivisionName.AGRICULTURE),
            ns.corporation.getCorporation().funds
        )
    );

    assignJobs(
        ns,
        DivisionName.AGRICULTURE,
        generateOfficeSetupsForEarlyRounds(
            option.agricultureOfficeSize,
            option.increaseBusiness
        )
    );
    assignJobs(
        ns,
        DivisionName.CHEMICAL,
        generateOfficeSetupsForEarlyRounds(3)
    );

    const optimalAmountOfBoostMaterialsForAgriculture = await findOptimalAmountOfBoostMaterials(
        ns,
        DivisionName.AGRICULTURE,
        agricultureIndustryData,
        CityName.Sector12,
        true,
        option.agricultureBoostMaterialsRatio
    );
    const optimalAmountOfBoostMaterialsForChemical = await findOptimalAmountOfBoostMaterials(
        ns,
        DivisionName.CHEMICAL,
        chemicalIndustryData,
        CityName.Sector12,
        true,
        0.95
    );
    await Promise.allSettled([
        stockMaterials(
            ns,
            DivisionName.AGRICULTURE,
            generateMaterialsOrders(
                cities,
                [
                    { name: MaterialName.AI_CORES, count: optimalAmountOfBoostMaterialsForAgriculture[0] },
                    { name: MaterialName.HARDWARE, count: optimalAmountOfBoostMaterialsForAgriculture[1] },
                    { name: MaterialName.REAL_ESTATE, count: optimalAmountOfBoostMaterialsForAgriculture[2] },
                    { name: MaterialName.ROBOTS, count: optimalAmountOfBoostMaterialsForAgriculture[3] },
                ]
            )
        ),
        stockMaterials(
            ns,
            DivisionName.CHEMICAL,
            generateMaterialsOrders(
                cities,
                [
                    { name: MaterialName.AI_CORES, count: optimalAmountOfBoostMaterialsForChemical[0] },
                    { name: MaterialName.HARDWARE, count: optimalAmountOfBoostMaterialsForChemical[1] },
                    { name: MaterialName.REAL_ESTATE, count: optimalAmountOfBoostMaterialsForChemical[2] },
                    { name: MaterialName.ROBOTS, count: optimalAmountOfBoostMaterialsForChemical[3] },
                ]
            )
        )
    ]);

    await waitForOffer(ns, 15, 10, 11e12);
    ns.corporation.acceptInvestmentOffer();
    while (ns.corporation.getCorporation().funds < 150_000_000_000) {
        await ns.sleep(2000);
      }
    await round3(ns);
}
async function round3(ns:NS, option: Round3Option = PrecalculatedRound3Option.OPTION1): Promise<void> {
    log(ns, `Executing round 3 offer.`, true, 'info');
    if (hasDivision(ns, DivisionName.TOBACCO)) {
        ns.spawn(ns.getScriptName(), { spawnDelay: 500 }, "--improveAllDivisions");
        return;
    }
    const corp = ns.corporation.getCorporation();

    buyUnlock(ns, UnlockName.MARKET_RESEARCH_DEMAND);
    buyUnlock(ns, UnlockName.MARKET_DATA_COMPETITION);

    if (corp.divisions.length < 20) {// Create Tobacco division
      await createDivision(ns, DivisionName.TOBACCO, 3, 1);

      // Create dummy divisions
      createDummyDivisions(ns, 20 - ns.corporation.getCorporation().divisions.length);
    }

    

    // Import materials
    for (const city of cities) {
        // We must prioritize Tobacco over Chemical when setting up export routes
        // Export Plants from Agriculture to Tobacco
        ns.corporation.cancelExportMaterial(DivisionName.AGRICULTURE, city, DivisionName.TOBACCO, city, "Plants");
        ns.corporation.exportMaterial(DivisionName.AGRICULTURE, city, DivisionName.TOBACCO, city, "Plants", exportString);

        // Export Plants from Agriculture to Chemical
        ns.corporation.cancelExportMaterial(DivisionName.AGRICULTURE, city, DivisionName.CHEMICAL, city, "Plants");
        ns.corporation.exportMaterial(DivisionName.AGRICULTURE, city, DivisionName.CHEMICAL, city, "Plants", exportString);
    }

    const agricultureDivision = ns.corporation.getDivision(DivisionName.AGRICULTURE);
    const chemicalDivision = ns.corporation.getDivision(DivisionName.CHEMICAL);
    const tobaccoDivision = ns.corporation.getDivision(DivisionName.TOBACCO);

    const agricultureDivisionBudget = 150e9;
    const chemicalDivisionBudget = 30e9;

    // division.productionMult is 0 when division is created. It will be updated in next state.
    while (ns.corporation.getDivision(DivisionName.TOBACCO).productionMult === 0) {
        await ns.corporation.nextUpdate();
    }

    await improveProductDivision(ns,
        DivisionName.TOBACCO,
        ns.corporation.getCorporation().funds * 0.99
        - agricultureDivisionBudget - chemicalDivisionBudget - 1e9,
        false,
        false,
        false
    );

    developNewProduct(
        ns,
        DivisionName.TOBACCO,
        mainProductDevelopmentCity,
        1e9
    );

    await improveSupportDivision(ns, 
        DivisionName.AGRICULTURE,
        agricultureDivisionBudget,
        defaultBudgetRatioForSupportDivision,
        false,
        false
    );

    await improveSupportDivision(ns, 
        DivisionName.CHEMICAL,
        chemicalDivisionBudget,
        defaultBudgetRatioForSupportDivision,
        false,
        false
    );

    await Promise.allSettled([
        buyBoostMaterials(ns, agricultureDivision),
        buyBoostMaterials(ns, chemicalDivision),
        buyBoostMaterials(ns, tobaccoDivision),
    ]);

    ns.spawn(ns.getScriptName(), { spawnDelay: 500 }, "--improveAllDivisions");
}

export async function createDivision(ns: NS, divisionName: string, officeSize: number, warehouseLevel: number): Promise<Division> {
    // Create division if not exists
    if (!hasDivision(ns, divisionName)) {
        let industryType;
        switch (divisionName) {
            case DivisionName.AGRICULTURE:
                industryType = IndustryType.AGRICULTURE;
                break;
            case DivisionName.CHEMICAL:
                industryType = IndustryType.CHEMICAL;
                break;
            case DivisionName.TOBACCO:
                industryType = IndustryType.TOBACCO;
                break;
            default:
                throw new Error(`Invalid division name: ${divisionName}`);
        }
        ns.corporation.expandIndustry(industryType, divisionName);
    }
    const division = ns.corporation.getDivision(divisionName);
    ns.print(`Initializing division: ${divisionName}`);

    // Expand to all cities
    for (const city of cities) {
        if (!division.cities.includes(city)) {
            ns.corporation.expandCity(divisionName, city);
            ns.print(`Expand ${divisionName} to ${city}`);
        }
        // Buy warehouse
        if (!ns.corporation.hasWarehouse(divisionName, city)) {
            ns.corporation.purchaseWarehouse(divisionName, city);
        }
    }
    // Set up all cities
    upgradeOffices(
        ns,
        divisionName,
        generateOfficeSetups(
            cities,
            officeSize,
            [
                {
                    name: EmployeePosition.RESEARCH_DEVELOPMENT,
                    count: officeSize
                }
            ]
        )
    );
    for (const city of cities) {
        upgradeWarehouse(ns, divisionName, city, warehouseLevel);
        // Enable Smart Supply
        if (ns.corporation.hasUnlock(UnlockName.SMART_SUPPLY)) {
            ns.corporation.setSmartSupply(divisionName, city, true);
        }
    }
    return ns.corporation.getDivision(divisionName);
}

export async function buyTeaAndThrowParty(ns: NS, divisionName: string): Promise<void> {
    const epsilon = 0.5;
    while (true) {
        let finish = true;
        for (const city of cities) {
            const office = ns.corporation.getOffice(divisionName, city);
            if (office.avgEnergy < office.maxEnergy - epsilon) {
                ns.corporation.buyTea(divisionName, city);
                finish = false;
            }
            if (office.avgMorale < office.maxMorale - epsilon) {
                ns.corporation.throwParty(divisionName, city, 500000);
                finish = false;
            }
        }
        if (finish) {
            break;
        }
        await ns.corporation.nextUpdate();
    }
}


//ns.getBitNodeMultipliers().CorporationValuation
export async function waitForOffer(ns: NS, numberOfInitCycles: number, maxAdditionalCycles: number, expectedOffer: number): Promise<void> {
  expectedOffer = expectedOffer * ns.getBitNodeMultipliers().CorporationValuation;
  await waitForNumberOfCycles(ns, numberOfInitCycles);
  let offer = ns.corporation.getInvestmentOffer().funds;
  for (let i = 0; i < maxAdditionalCycles; i++) {
      await waitForNumberOfCycles(ns, 1);
      offer = ns.corporation.getInvestmentOffer().funds;
      if (offer > expectedOffer) {
          break;
      }
  }
  if (offer < expectedOffer) {
      log(ns,
          `Offer is lower than expected value. Offer: ${ns.formatNumber(offer)}`
          + `. Expected value: ${ns.formatNumber(expectedOffer)}.`
      , true, 'info');
  }
}

export function hasDivision(ns: NS, divisionName: string): boolean {
    return ns.corporation.getCorporation().divisions.includes(divisionName);
}

export function generateMaterialsOrders(
    cities: CityName[],
    materials: {
        name: MaterialName;
        count: number;
    }[]
): MaterialOrder[] {
    const orders: MaterialOrder[] = [];
    for (const city of cities) {
        orders.push({
            city: city,
            materials: materials
        });
    }
    return orders;
}



export async function findOptimalAmountOfBoostMaterials(
    ns: NS,
    divisionName: string,
    industryData: CorpIndustryData,
    city: CityName,
    useWarehouseSize: boolean,
    ratio: number
): Promise<number[]> {
    const warehouseSize = ns.corporation.getWarehouse(divisionName, city).size;
    if (useWarehouseSize) {
        return getOptimalBoostMaterialQuantities(industryData, warehouseSize * ratio);
    }
    await waitUntilAfterStateHappens(ns, CorpState.PRODUCTION);
    const availableSpace = ns.corporation.getWarehouse(divisionName, city).size
        - ns.corporation.getWarehouse(divisionName, city).sizeUsed;
    return getOptimalBoostMaterialQuantities(industryData, availableSpace * ratio);
}


export function generateOfficeSetupsForEarlyRounds(size: number, increaseBusiness = false): OfficeSetup[] {
    let officeSetup;
    switch (size) {
        case 3:
            officeSetup = [
                { name: EmployeePosition.OPERATIONS, count: 1 },
                { name: EmployeePosition.ENGINEER, count: 1 },
                { name: EmployeePosition.BUSINESS, count: 1 },
                { name: EmployeePosition.MANAGEMENT, count: 0 },
            ];
            break;
        case 4:
            officeSetup = [
                { name: EmployeePosition.OPERATIONS, count: 1 },
                { name: EmployeePosition.ENGINEER, count: 1 },
                { name: EmployeePosition.BUSINESS, count: 1 },
                { name: EmployeePosition.MANAGEMENT, count: 1 },
            ];
            break;
        case 5:
            officeSetup = [
                { name: EmployeePosition.OPERATIONS, count: 2 },
                { name: EmployeePosition.ENGINEER, count: 1 },
                { name: EmployeePosition.BUSINESS, count: 1 },
                { name: EmployeePosition.MANAGEMENT, count: 1 },
            ];
            break;
        case 6:
            if (increaseBusiness) {
                officeSetup = [
                    { name: EmployeePosition.OPERATIONS, count: 2 },
                    { name: EmployeePosition.ENGINEER, count: 1 },
                    { name: EmployeePosition.BUSINESS, count: 2 },
                    { name: EmployeePosition.MANAGEMENT, count: 1 },
                ];

            } else {
                officeSetup = [
                    { name: EmployeePosition.OPERATIONS, count: 2 },
                    { name: EmployeePosition.ENGINEER, count: 1 },
                    { name: EmployeePosition.BUSINESS, count: 1 },
                    { name: EmployeePosition.MANAGEMENT, count: 2 },
                ];
            }
            break;
        case 7:
            if (increaseBusiness) {
                officeSetup = [
                    { name: EmployeePosition.OPERATIONS, count: 2 },
                    { name: EmployeePosition.ENGINEER, count: 1 },
                    { name: EmployeePosition.BUSINESS, count: 2 },
                    { name: EmployeePosition.MANAGEMENT, count: 2 },
                ];

            } else {
                officeSetup = [
                    { name: EmployeePosition.OPERATIONS, count: 3 },
                    { name: EmployeePosition.ENGINEER, count: 1 },
                    { name: EmployeePosition.BUSINESS, count: 1 },
                    { name: EmployeePosition.MANAGEMENT, count: 2 },
                ];
            }
            break;
        case 8:
            if (increaseBusiness) {
                officeSetup = [
                    { name: EmployeePosition.OPERATIONS, count: 3 },
                    { name: EmployeePosition.ENGINEER, count: 1 },
                    { name: EmployeePosition.BUSINESS, count: 2 },
                    { name: EmployeePosition.MANAGEMENT, count: 2 },
                ];

            } else {
                officeSetup = [
                    { name: EmployeePosition.OPERATIONS, count: 3 },
                    { name: EmployeePosition.ENGINEER, count: 1 },
                    { name: EmployeePosition.BUSINESS, count: 1 },
                    { name: EmployeePosition.MANAGEMENT, count: 3 },
                ];
            }
            break;
        default:
            throw new Error(`Invalid office size: ${size}`);
    }
    return generateOfficeSetups(
        cities,
        size,
        officeSetup
    );
}

export async function improveProductDivisionSupportOffices(ns:NS,
    divisionName: string,
    budget: number,
    dryRun: boolean,
    enableLogging: boolean
): Promise<void> {
    //const logger = new Logger(enableLogging);
    const officeSetups: OfficeSetup[] = [];
    if (budget > ns.corporation.getCorporation().funds) {
        // Bypass usage of logger. If this happens, there is race condition. We must be notified about it.
        console.warn(
            `Budget is higher than current funds. Budget: ${ns.formatNumber(budget)}, `
            + `funds: ${ns.formatNumber(ns.corporation.getCorporation().funds)}`
        );
        budget = ns.corporation.getCorporation().funds * 0.9;
    }
    const budgetForEachOffice = budget / 5;
    for (const city of supportProductDevelopmentCities) {
        const office = ns.corporation.getOffice(divisionName, city);
        const maxOfficeSize = getMaxAffordableOfficeSize(ns, office.size, budgetForEachOffice);
        if (maxOfficeSize < 5) {
            throw new Error(`Budget for office is too low. Division: ${divisionName}. Office's budget: ${ns.formatNumber(budgetForEachOffice)}`);
        }
        if (maxOfficeSize < office.size) {
            continue;
        }
        const officeSetup: OfficeSetup = {
            city: city,
            size: maxOfficeSize,
            jobs: {
                Operations: 0,
                Engineer: 0,
                Business: 0,
                Management: 0,
                "Research & Development": 0,
            }
        };
        if (ns.corporation.getInvestmentOffer().round === 3 && maxNumberOfProductsInRound3 === 1) {
            officeSetup.jobs.Operations = 0;
            officeSetup.jobs.Engineer = 0;
            officeSetup.jobs.Business = 0;
            officeSetup.jobs.Management = 0;
            officeSetup.jobs["Research & Development"] = maxOfficeSize;
        } else if (ns.corporation.getInvestmentOffer().round === 3 || ns.corporation.getInvestmentOffer().round === 4) {
            officeSetup.jobs.Operations = 1;
            officeSetup.jobs.Engineer = 1;
            officeSetup.jobs.Business = 1;
            officeSetup.jobs.Management = 1;
            officeSetup.jobs["Research & Development"] = maxOfficeSize - 4;
        } else {
            const rndEmployee = Math.min(
                Math.floor(maxOfficeSize * 0.5),
                maxOfficeSize - 4
            );
            const nonRnDEmployees = maxOfficeSize - rndEmployee;
            // Reuse the ratio of "profit" setup in round 4. It's good enough.
            officeSetup.jobs.Operations = Math.floor(nonRnDEmployees * precalculatedEmployeeRatioForProfitSetupOfRound4.operations);
            officeSetup.jobs.Engineer = Math.floor(nonRnDEmployees * precalculatedEmployeeRatioForProfitSetupOfRound4.engineer);
            officeSetup.jobs.Business = Math.floor(nonRnDEmployees * precalculatedEmployeeRatioForProfitSetupOfRound4.business);
            officeSetup.jobs.Management = nonRnDEmployees - (officeSetup.jobs.Operations + officeSetup.jobs.Engineer + officeSetup.jobs.Business);
            officeSetup.jobs["Research & Development"] = rndEmployee;
        }
        officeSetups.push(officeSetup);
    }
    if (!dryRun) {
        upgradeOffices(ns, divisionName, officeSetups);
    }
}

export function getMaxAffordableOfficeSize(ns:NS, fromSize: number, maxCost: number): number {
    return Math.floor(
        3 * getGenericMaxAffordableUpgradeLevel(ns, officeUpgradeBasePrice, 1.09, fromSize / 3, maxCost, false)
    );
}

export async function improveProductDivisionMainOffice(ns:NS,
    divisionName: string,
    industryData: CorpIndustryData,
    budget: number,
    dryRun: boolean,
    enableLogging: boolean
): Promise<void> {
    const profit = getProfit(ns);
    const division = ns.corporation.getDivision(divisionName);
    const office = ns.corporation.getOffice(divisionName, mainProductDevelopmentCity);
    const maxOfficeSize = getMaxAffordableOfficeSize(ns, office.size, budget);
    if (maxOfficeSize < office.size) {
        return;
    }
    const officeSetup: OfficeSetup = {
        city: mainProductDevelopmentCity,
        size: maxOfficeSize,
        jobs: {
            Operations: 0,
            Engineer: 0,
            Business: 0,
            Management: 0,
            "Research & Development": 0,
        }
    };
    const products = division.products;
    let item: Product;
    let sortType: OfficeBenchmarkSortType;
    let useCurrentItemData = true;
    if (usePrecalculatedEmployeeRatioForProductDivision) {
        let precalculatedEmployeeRatioForProductDivision;
        if (ns.corporation.getInvestmentOffer().round === 3) {
            precalculatedEmployeeRatioForProductDivision = precalculatedEmployeeRatioForProductDivisionRound3;
        } else if (ns.corporation.getInvestmentOffer().round === 4) {
            precalculatedEmployeeRatioForProductDivision = precalculatedEmployeeRatioForProductDivisionRound4;
        } else if (ns.corporation.getInvestmentOffer().round === 5 && profit < 1e30) {
            precalculatedEmployeeRatioForProductDivision = precalculatedEmployeeRatioForProductDivisionRound5_1;
        } else if (ns.corporation.getInvestmentOffer().round === 5 && profit >= 1e30) {
            precalculatedEmployeeRatioForProductDivision = precalculatedEmployeeRatioForProductDivisionRound5_2;
        } else {
            throw new Error("Invalid precalculated employee ratio");
        }
        officeSetup.jobs.Operations = Math.floor(officeSetup.size * precalculatedEmployeeRatioForProductDivision.operations);
        officeSetup.jobs.Engineer = Math.floor(officeSetup.size * precalculatedEmployeeRatioForProductDivision.engineer);
        officeSetup.jobs.Business = Math.floor(officeSetup.size * precalculatedEmployeeRatioForProductDivision.business);
        if (officeSetup.jobs.Business === 0) {
            officeSetup.jobs.Business = 1;
        }
        officeSetup.jobs.Management = officeSetup.size - (officeSetup.jobs.Operations + officeSetup.jobs.Engineer + officeSetup.jobs.Business);
    } else {
        if (ns.corporation.getInvestmentOffer().round === 3
            || ns.corporation.getInvestmentOffer().round === 4) {
            sortType = "progress";
        } else {
            sortType = "profit_progress";
        }
        let bestProduct = null;
        let highestEffectiveRating = Number.MIN_VALUE;
        for (const productName of products) {
            const product = ns.corporation.getProduct(divisionName, mainProductDevelopmentCity, productName);
            if (product.developmentProgress < 100) {
                continue;
            }
            if (product.effectiveRating > highestEffectiveRating) {
                bestProduct = product;
                highestEffectiveRating = product.effectiveRating;
            }
        }
        if (!bestProduct) {
            useCurrentItemData = false;
            item = {
                name: sampleProductName,
                demand: 54,
                competition: 35,
                rating: 36000,
                effectiveRating: 36000,
                stats: {
                    quality: 42000,
                    performance: 46000,
                    durability: 20000,
                    reliability: 31000,
                    aesthetics: 25000,
                    features: 37000,
                },
                // Material's market price is different between cities. We use Sector12's price as reference price.
                productionCost: getProductMarketPrice(ns, division, industryData, CityName.Sector12),
                desiredSellPrice: 0,
                desiredSellAmount: 0,
                stored: 0,
                productionAmount: 0,
                actualSellAmount: 0,
                developmentProgress: 100,
                advertisingInvestment: ns.corporation.getCorporation().funds * 0.01 / 2,
                designInvestment: ns.corporation.getCorporation().funds * 0.01 / 2,
                size: 0.05,
            };
        } else {
            item = bestProduct;
            log(ns, `Use product: ${JSON.stringify(item)}`, true, 'info');
        }
        const dataArray = await optimizeOffice(
            ns,
            division,
            industryData,
            mainProductDevelopmentCity,
            maxOfficeSize,
            0,
            item,
            useCurrentItemData,
            sortType,
            getBalancingModifierForProfitProgress(ns),
            maxRerunWhenOptimizingOfficeForProductDivision,
            defaultPerformanceModifierForOfficeBenchmark,
            enableLogging
        );
        if (dataArray.length === 0) {
            throw new Error(`Cannot calculate optimal office setup. maxTotalEmployees: ${maxOfficeSize}`);
        }
        const optimalData = dataArray[dataArray.length - 1];
        officeSetup.jobs = {
            Operations: optimalData.operations,
            Engineer: optimalData.engineer,
            Business: optimalData.business,
            Management: optimalData.management,
            "Research & Development": 0,
        };
    }

    log(ns, `mainOffice: ${JSON.stringify(officeSetup)}`, true, 'info');
    if (!dryRun) {
        upgradeOffices(ns, divisionName, [officeSetup]);
    }
}



function getBalancingModifierForProfitProgress(ns: NS): BalancingModifierForProfitProgress {
    if (getProfit(ns) >= 1e35) {
        return {
            profit: 1,
            progress: 2.5
        };
    }
    return {
        profit: 1,
        progress: 5
    };
}

async function improveSupportDivision(ns:NS,
    divisionName: string,
    totalBudget: number,
    budgetRatio: {
        warehouse: number;
        office: number;
    },
    dryRun: boolean,
    enableLogging: boolean
): Promise<void> {
    if (totalBudget < 0) {
        return;
    }

    const warehouseBudget = totalBudget * budgetRatio.warehouse / 6;
    const officeBudget = totalBudget * budgetRatio.office / 6;
    const officeSetups: OfficeSetup[] = [];
    for (const city of cities) {
        const currentWarehouseLevel = ns.corporation.getWarehouse(divisionName, city).level;
        const newWarehouseLevel = getMaxAffordableWarehouseLevel(currentWarehouseLevel, warehouseBudget);
        if (newWarehouseLevel > currentWarehouseLevel && !dryRun) {
            ns.corporation.upgradeWarehouse(divisionName, city, newWarehouseLevel - currentWarehouseLevel);
        }
    }

    // We use Sector-12's office as the base to find the optimal setup for all cities' offices. This is not entirely
    // accurate, because each office has different employee's stats. However, the optimal setup of each office won't be
    // much different even with that concern.
    const city = CityName.Sector12;
    const office = ns.corporation.getOffice(divisionName, city);
    const maxOfficeSize = getMaxAffordableOfficeSize(ns, office.size, officeBudget);
    if (maxOfficeSize < 6) {
        throw new Error(`Budget for office is too low. Division: ${divisionName}. Office's budget: ${ns.formatNumber(officeBudget)}`);
    }
    const rndEmployee = Math.min(
        Math.floor(maxOfficeSize * 0.2),
        maxOfficeSize - 3
    );
    const nonRnDEmployees = maxOfficeSize - rndEmployee;
    const officeSetup: OfficeSetup = {
        city: city,
        size: maxOfficeSize,
        jobs: {
            Operations: 0,
            Engineer: 0,
            Business: 0,
            Management: 0,
            "Research & Development": rndEmployee,
        }
    };
    if (usePrecalculatedEmployeeRatioForSupportDivisions) {
        officeSetup.jobs.Operations = Math.floor(nonRnDEmployees * precalculatedEmployeeRatioForSupportDivisions.operations);
        officeSetup.jobs.Business = Math.floor(nonRnDEmployees * precalculatedEmployeeRatioForSupportDivisions.business);
        officeSetup.jobs.Management = Math.floor(nonRnDEmployees * precalculatedEmployeeRatioForSupportDivisions.management);
        officeSetup.jobs.Engineer = nonRnDEmployees - (officeSetup.jobs.Operations + officeSetup.jobs.Business + officeSetup.jobs.Management);
    } else {
        let item: Material;
        switch (divisionName) {
            case DivisionName.AGRICULTURE:
                item = ns.corporation.getMaterial(divisionName, city, MaterialName.PLANTS);
                break;
            case DivisionName.CHEMICAL:
                item = ns.corporation.getMaterial(divisionName, city, MaterialName.CHEMICALS);
                break;
            default:
                throw new Error(`Invalid division: ${divisionName}`);
        }
        if (nonRnDEmployees <= 3) {
            throw new Error("Invalid R&D ratio");
        }
        const division = ns.corporation.getDivision(divisionName);
        const industryData = ns.corporation.getIndustryData(division.type);
        const dataArray = await optimizeOffice(
            ns,
            division,
            industryData,
            city,
            nonRnDEmployees,
            rndEmployee,
            item,
            true,
            "rawProduction",
            getBalancingModifierForProfitProgress(ns),
            0, // Do not rerun
            20, // Half of defaultPerformanceModifierForOfficeBenchmark
            enableLogging,
            {
                engineer: Math.floor(nonRnDEmployees * 0.625),
                business: 0
            }
        );
        if (dataArray.length === 0) {
            throw new Error(`Cannot calculate optimal office setup. Division: ${divisionName}, nonRnDEmployees: ${nonRnDEmployees}`);
        } else {
            const optimalData = dataArray[dataArray.length - 1];
            officeSetup.jobs = {
                Operations: optimalData.operations,
                Engineer: optimalData.engineer,
                Business: optimalData.business,
                Management: optimalData.management,
                "Research & Development": rndEmployee,
            };
        }
    }
    for (const city of cities) {
        officeSetups.push({
            city: city,
            size: officeSetup.size,
            jobs: officeSetup.jobs
        });
    }
    if (!dryRun) {
        upgradeOffices(ns, divisionName, officeSetups);
    }
}


async function improveProductDivisionOffices(ns:NS,
    divisionName: string,
    industryData: CorpIndustryData,
    budget: number,
    dryRun: boolean,
    enableLogging: boolean
): Promise<void> {
    let ratio = {
        mainOffice: 0.5,
        supportOffices: 0.5
    };
    if (ns.corporation.getInvestmentOffer().round === 3) {
        ratio = {
            mainOffice: 0.75,
            supportOffices: 0.25
        };
    }
    await improveProductDivisionMainOffice(ns,
        divisionName,
        industryData,
        budget * ratio.mainOffice,
        dryRun,
        enableLogging
    );
    await improveProductDivisionSupportOffices(ns,
        divisionName,
        budget * ratio.supportOffices,
        dryRun,
        enableLogging
    );
}

export async function improveProductDivision(ns:NS,
    divisionName: string,
    totalBudget: number,
    skipUpgradingOffice: boolean,
    dryRun: boolean,
    enableLogging: boolean
): Promise<void> {
    if (totalBudget < 0) {
        return;
    }
    const division = ns.corporation.getDivision(divisionName);
    const industryData = ns.corporation.getIndustryData(division.type);
    const divisionResearches = getDivisionResearches(ns, divisionName);
    const benchmark = new CorporationOptimizer();
    const currentFunds = ns.corporation.getCorporation().funds;

    if (getProfit(ns) >= thresholdOfFocusingOnAdvert) {
        budgetRatioForProductDivision = budgetRatioForProductDivisionWithoutAdvert;
    }

    // employeeStatUpgrades
    const employeeStatUpgradesBudget = totalBudget * budgetRatioForProductDivision.employeeStatUpgrades;
    const currentCreativityUpgradeLevel = ns.corporation.getUpgradeLevel(UpgradeName.NUOPTIMAL_NOOTROPIC_INJECTOR_IMPLANTS);
    const currentCharismaUpgradeLevel = ns.corporation.getUpgradeLevel(UpgradeName.SPEECH_PROCESSOR_IMPLANTS);
    const currentIntelligenceUpgradeLevel = ns.corporation.getUpgradeLevel(UpgradeName.NEURAL_ACCELERATORS);
    const currentEfficiencyUpgradeLevel = ns.corporation.getUpgradeLevel(UpgradeName.FOCUS_WIRES);
    const newCreativityUpgradeLevel = getMaxAffordableUpgradeLevel(ns,
        UpgradeName.NUOPTIMAL_NOOTROPIC_INJECTOR_IMPLANTS,
        currentCreativityUpgradeLevel,
        employeeStatUpgradesBudget / 4
    );
    const newCharismaUpgradeLevel = getMaxAffordableUpgradeLevel(ns,
        UpgradeName.SPEECH_PROCESSOR_IMPLANTS,
        currentCharismaUpgradeLevel,
        employeeStatUpgradesBudget / 4
    );
    const newIntelligenceUpgradeLevel = getMaxAffordableUpgradeLevel(ns,
        UpgradeName.NEURAL_ACCELERATORS,
        currentIntelligenceUpgradeLevel,
        employeeStatUpgradesBudget / 4
    );
    const newEfficiencyUpgradeLevel = getMaxAffordableUpgradeLevel(ns,
        UpgradeName.FOCUS_WIRES,
        currentEfficiencyUpgradeLevel,
        employeeStatUpgradesBudget / 4
    );
    if (!dryRun) {
        buyUpgrade(ns, UpgradeName.NUOPTIMAL_NOOTROPIC_INJECTOR_IMPLANTS, newCreativityUpgradeLevel);
        buyUpgrade(ns, UpgradeName.SPEECH_PROCESSOR_IMPLANTS, newCharismaUpgradeLevel);
        buyUpgrade(ns, UpgradeName.NEURAL_ACCELERATORS, newIntelligenceUpgradeLevel);
        buyUpgrade(ns, UpgradeName.FOCUS_WIRES, newEfficiencyUpgradeLevel);
    }

    // salesBot
    const salesBotBudget = totalBudget * budgetRatioForProductDivision.salesBot;
    const currentSalesBotUpgradeLevel = ns.corporation.getUpgradeLevel(UpgradeName.ABC_SALES_BOTS);
    const newSalesBotUpgradeLevel = getMaxAffordableUpgradeLevel(ns,
        UpgradeName.ABC_SALES_BOTS,
        currentSalesBotUpgradeLevel,
        salesBotBudget
    );
    if (!dryRun) {
        buyUpgrade(ns, UpgradeName.ABC_SALES_BOTS, newSalesBotUpgradeLevel);
    }

    // projectInsight
    const projectInsightBudget = totalBudget * budgetRatioForProductDivision.projectInsight;
    const currentProjectInsightUpgradeLevel = ns.corporation.getUpgradeLevel(UpgradeName.PROJECT_INSIGHT);
    const newProjectInsightUpgradeLevel = getMaxAffordableUpgradeLevel(ns,
        UpgradeName.PROJECT_INSIGHT,
        currentProjectInsightUpgradeLevel,
        projectInsightBudget
    );
    if (!dryRun) {
        buyUpgrade(ns, UpgradeName.PROJECT_INSIGHT, newProjectInsightUpgradeLevel);
    }

    // rawProduction
    const rawProductionBudget = totalBudget * budgetRatioForProductDivision.rawProduction;
    improveProductDivisionRawProduction(ns,
        division.name,
        industryData,
        divisionResearches,
        rawProductionBudget,
        dryRun,
        benchmark,
        enableLogging
    );

    // wilsonAdvert
    const wilsonAdvertBudget = totalBudget * budgetRatioForProductDivision.wilsonAdvert;
    improveProductDivisionWilsonAdvert(ns,
        division.name,
        industryData,
        divisionResearches,
        wilsonAdvertBudget,
        dryRun,
        benchmark,
        enableLogging
    );

    // office
    if (!skipUpgradingOffice) {
        const officesBudget = totalBudget * budgetRatioForProductDivision.office;
        await improveProductDivisionOffices(ns,
            division.name,
            industryData,
            officesBudget,
            dryRun,
            enableLogging
        );
    }

    log(ns, `Spent: ${ns.formatNumber(currentFunds - ns.corporation.getCorporation().funds)}`, true, 'info');
}


function improveProductDivisionWilsonAdvert(ns:NS,
    divisionName: string,
    industryData: CorpIndustryData,
    divisionResearches: DivisionResearches,
    budget: number,
    dryRun: boolean,
    benchmark: CorporationOptimizer,
    enableLogging: boolean
): void {
    //const logger = new Logger(enableLogging);
    const division = ns.corporation.getDivision(divisionName);
    const dataArray = benchmark.optimizeWilsonAndAdvert(ns,
        industryData,
        ns.corporation.getUpgradeLevel(UpgradeName.WILSON_ANALYTICS),
        ns.corporation.getHireAdVertCount(divisionName),
        division.awareness,
        division.popularity,
        divisionResearches,
        budget,
        enableLogging
    );
    if (dataArray.length === 0) {
        return;
    }
    const optimalData = dataArray[dataArray.length - 1];
    //logger.log(`wilsonAdvert: ${JSON.stringify(optimalData)}`);
    if (!dryRun) {
        buyUpgrade(ns, UpgradeName.WILSON_ANALYTICS, optimalData.wilsonLevel);
        buyAdvert(ns, divisionName, optimalData.advertLevel);
    }
}
function improveProductDivisionRawProduction(ns:NS,
    divisionName: string,
    industryData: CorpIndustryData,
    divisionResearches: DivisionResearches,
    budget: number,
    dryRun: boolean,
    benchmark: CorporationOptimizer,
    enableLogging: boolean
): void {
    //const logger = new Logger(enableLogging);
    const dataArray = benchmark.optimizeStorageAndFactory(ns,
        industryData,
        ns.corporation.getUpgradeLevel(UpgradeName.SMART_STORAGE),
        // Assume that all warehouses are at the same level
        ns.corporation.getWarehouse(divisionName, CityName.Sector12).level,
        ns.corporation.getUpgradeLevel(UpgradeName.SMART_FACTORIES),
        divisionResearches,
        budget,
        enableLogging
    );
    if (dataArray.length === 0) {
        return;
    }
    const optimalData = dataArray[dataArray.length - 1];
    //logger.log(`rawProduction: ${JSON.stringify(optimalData)}`);
    if (!dryRun) {
        buyUpgrade(ns, UpgradeName.SMART_STORAGE, optimalData.smartStorageLevel);
        buyUpgrade(ns, UpgradeName.SMART_FACTORIES, optimalData.smartFactoriesLevel);
        for (const city of cities) {
            const currentWarehouseLevel = ns.corporation.getWarehouse(divisionName, city).level;
            if (optimalData.warehouseLevel > currentWarehouseLevel) {
                ns.corporation.upgradeWarehouse(
                    divisionName,
                    city,
                    optimalData.warehouseLevel - currentWarehouseLevel
                );
            }
        }
    }
}

async function improveAllDivisions(ns:NS): Promise<void> {

    while (ns.corporation.getCorporation().funds < 150_000_000_000) {
      await ns.sleep(2000);
    }
    
    // This is used for calling improveProductDivision with skipUpgradingOffice = true
    const pendingImprovingProductDivisions1 = new Map<string, number>();
    // This is used for manually calling improveProductDivisionOffices
    const pendingImprovingProductDivisions2 = new Map<string, number>();
    const pendingImprovingSupportDivisions = new Map<string, number>();
    const pendingBuyingBoostMaterialsDivisions = new Set<string>();
    const buyBoostMaterialsIfNeeded = (divisionName: string) => {
        if (!pendingBuyingBoostMaterialsDivisions.has(divisionName)) {
            pendingBuyingBoostMaterialsDivisions.add(divisionName);
            log(ns, `Buying boost materials for division: ${divisionName}`, true, 'info');
            buyBoostMaterials(ns, ns.corporation.getDivision(divisionName)).then(() => {
                pendingBuyingBoostMaterialsDivisions.delete(divisionName);
            });
        }
    };
    log(ns, `Improving Tobacco`, true, 'info');
    await improveProductDivision(ns,
        DivisionName.TOBACCO,
        ns.corporation.getCorporation().funds * 0.99 - 1e9,
        false,
        false,
        false
    );
    log(ns, `buying boosts for Tobacco`, true, 'info');
    buyBoostMaterialsIfNeeded(DivisionName.TOBACCO);

    let reservedFunds = 0;
    const increaseReservedFunds = (amount: number) => {
        console.log(`Increase reservedFunds by ${ns.formatNumber(amount)}`);
        reservedFunds += amount;
        console.log(`New reservedFunds: ${ns.formatNumber(reservedFunds)}`);
    };
    const decreaseReservedFunds = (amount: number) => {
        console.log(`Decrease reservedFunds by ${ns.formatNumber(amount)}`);
        reservedFunds -= amount;
        console.log(`New reservedFunds: ${ns.formatNumber(reservedFunds)}`);
    };

    // We use preparingToAcceptOffer to prevent optimizing office right before we switch all offices to "profit" setup.
    // This eliminates a potential race condition.
    let preparingToAcceptOffer = false;
    // noinspection InfiniteLoopJS
    while (true) {
      while (ns.corporation.getCorporation().funds < 150_000_000_000) {
        await ns.sleep(2000);
      }
      const currentRound = ns.corporation.getInvestmentOffer().round;
      let corp = ns.corporation.getCorporation();
      log(ns, `Public: ${corp.public}, ${corp.funds} > 4e+18`)
      if (corp.public) {
        //buy back all shares
        let sharesAvail = corp.totalShares - corp.numShares;
        log(ns, `Our shares: ${corp.numShares}, sharesAvail, ${sharesAvail}`);
        while (sharesAvail > 0) {
          const money = ns.getPlayer().money;
          const sharesToPurchase = Math.floor(Math.min(money/corp.sharePrice, sharesAvail));
          log(ns, `Our shares: ${corp.numShares}, sharesAvail, ${sharesAvail}, attempting to purchase ${sharesToPurchase} at ${corp.sharePrice} with ${money}, total cost ${corp.sharePrice*sharesToPurchase}`, true, 'info');
          if (sharesToPurchase > 0) {
            try{
              ns.corporation.buyBackShares(sharesToPurchase);
            } catch (e) {
              break;
            }
          }
          await ns.sleep(2000);
          corp = ns.corporation.getCorporation();
          sharesAvail = corp.totalShares - corp.numShares;
        }
        //once we buy back all shares, bribe factions
        const factions = ns.getPlayer().factions;
        const fundsToBribe = Math.floor(corp.funds/factions.length/2);
        for (const factionName of factions) {
          log(ns, `Bribing: ${factionName} with ${fundsToBribe}`, true, 'info');
          ns.corporation.bribe(factionName, fundsToBribe);
        }
      }
      else if (!corp.public && currentRound > 5) {
        log(ns, `We are going public and issuing dividends!`, true, 'info');
        ns.corporation.goPublic(corp.numShares * 0.1);
        ns.corporation.issueDividends(0.5);
        await buyUnlock(ns, UnlockName.SHADY_ACCOUNTING);
        await buyUnlock(ns, UnlockName.GOVERNMENT_PARTNERSHIP);
      }
        const profit = getProfit(ns);

        await buyResearch(ns);

        if (ns.corporation.getDivision(DivisionName.TOBACCO).awareness !== Number.MAX_VALUE) {
            // Buy Wilson ASAP if we can afford it with the last cycle's profit. Budget for Wilson and Advert is just part of
            // current funds, it's usually too low for our benchmark to calculate the optimal combination. The benchmark is
            // most suitable for big-budget situation, like after accepting investment offer.
            const currentWilsonLevel = ns.corporation.getUpgradeLevel(UpgradeName.WILSON_ANALYTICS);
            const maxWilsonLevel = getMaxAffordableUpgradeLevel(ns, UpgradeName.WILSON_ANALYTICS, currentWilsonLevel, profit);
            if (maxWilsonLevel > currentWilsonLevel) {
                buyUpgrade(ns, UpgradeName.WILSON_ANALYTICS, maxWilsonLevel);
            }

            // Prioritize Advert
            if (profit >= thresholdOfFocusingOnAdvert) {
                const currentAdvertLevel = ns.corporation.getHireAdVertCount(DivisionName.TOBACCO);
                const maxAdvertLevel = getMaxAffordableAdVertLevel(ns,
                    currentAdvertLevel,
                    (ns.corporation.getCorporation().funds - reservedFunds) * 0.6
                );
                if (maxAdvertLevel > currentAdvertLevel) {
                    buyAdvert(ns, DivisionName.TOBACCO, maxAdvertLevel);
                }
            }
        }

        const totalFunds = ns.corporation.getCorporation().funds - reservedFunds;
        let availableFunds = totalFunds;

        // In round 3 and 4, we only develop up to maxNumberOfProducts
        let maxNumberOfProducts = maxNumberOfProductsInRound3;
        if (currentRound === 4) {
            maxNumberOfProducts = maxNumberOfProductsInRound4;
        }
        if (currentRound === 3 || currentRound === 4) {
            const productIdArray = getProductIdArray(ns, DivisionName.TOBACCO);
            let numberOfDevelopedProducts = 0;
            if (productIdArray.length > 0) {
                numberOfDevelopedProducts = Math.max(...productIdArray) + 1;
            }
            if (numberOfDevelopedProducts >= maxNumberOfProducts) {
                // If all products are finished, we wait for 15 cycles, then accept investment offer.
                // We take a "snapshot" of product list here. When we use the standard setup, we use only 1 slot of
                // product slots while waiting for offer. In that case, we can develop the next product while waiting.
                // This "snapshot" ensures the product list that we use to calculate the "profit" setup does not include
                // the developing product.
                const products = ns.corporation.getDivision(DivisionName.TOBACCO).products;
                const allProductsAreFinished = products.every(productName => {
                    const product = ns.corporation.getProduct(DivisionName.TOBACCO, mainProductDevelopmentCity, productName);
                    return product.developmentProgress === 100;
                });
                const getNewestProduct = () => {
                    return ns.corporation.getProduct(DivisionName.TOBACCO, mainProductDevelopmentCity, products[products.length - 1]);
                };
                const newestProduct = getNewestProduct();
                
                if (!preparingToAcceptOffer
                    && newestProduct.developmentProgress > 98
                    && newestProduct.developmentProgress < 100) {
                    preparingToAcceptOffer = true;
                }
                if (allProductsAreFinished) {
                    const productDevelopmentBudget = totalFunds * 0.01;
                    const newProductName = developNewProduct(
                        ns,
                        DivisionName.TOBACCO,
                        mainProductDevelopmentCity,
                        productDevelopmentBudget
                    );
                    if (newProductName) {
                        //corporationEventLogger.generateNewProductEvent(ns, DivisionName.TOBACCO);
                        availableFunds -= productDevelopmentBudget;
                    }

                    // Wait until newest product's effectiveRating is not 0
                    while (getNewestProduct().effectiveRating === 0) {
                        await waitForNumberOfCycles(ns, 1);
                    }

                    // Switch all offices to "profit" setup to maximize the offer
                    await switchAllOfficesToProfitSetup(ns,
                        tobaccoIndustryData,
                        // We must use the latest data of product
                        getNewestProduct()
                    );

                    let expectedOffer = Number.MAX_VALUE;
                    if (currentRound === 3) {
                        expectedOffer = 1e16;
                    } else if (currentRound === 4) {
                        expectedOffer = 1e20;
                    }
                    await waitForOffer(ns, 10, 5, expectedOffer);
                    ns.corporation.acceptInvestmentOffer();
                    preparingToAcceptOffer = false;
                    continue;
                }
            }
        }

        // Skip developing new product if we are at the near end of exponential phase
        if (profit <= 1e40 || availableFunds >= 1e72) {
            let productDevelopmentBudget = totalFunds * 0.01;
            // Make sure that we use at least 1e72 for productDevelopmentBudget after exponential phase
            if (availableFunds >= 1e72) {
                productDevelopmentBudget = Math.max(productDevelopmentBudget, 1e72);
            }
            const newProductName = developNewProduct(
                ns,
                DivisionName.TOBACCO,
                mainProductDevelopmentCity,
                productDevelopmentBudget
            );
            if (newProductName) {
                //console.log(`Develop ${newProductName}`);
                //corporationEventLogger.generateNewProductEvent(ns, DivisionName.TOBACCO);
                availableFunds -= productDevelopmentBudget;
            }
        } else {
            const products = ns.corporation.getDivision(DivisionName.TOBACCO).products;
            const allProductsAreFinished = products.every(productName => {
                const product = ns.corporation.getProduct(DivisionName.TOBACCO, mainProductDevelopmentCity, productName);
                return product.developmentProgress === 100;
            });
            if (allProductsAreFinished) {
                //corporationEventLogger.generateSkipDevelopingNewProductEvent(ns);
            }
        }

        const tobaccoHasRevenue = ns.corporation.getDivision(DivisionName.TOBACCO).lastCycleRevenue > 0;
        const budgetForTobaccoDivision = totalFunds * 0.9;
        if (tobaccoHasRevenue
            && needToUpgradeDivision(ns,DivisionName.TOBACCO, budgetForTobaccoDivision)) {
            availableFunds -= budgetForTobaccoDivision;

            // Skip upgrading office in the following function call. We need to buy corporation's upgrades ASAP, so we
            // will upgrade offices in a separate call later.
            if (!pendingImprovingProductDivisions1.has(DivisionName.TOBACCO)) {
                const nonOfficesBudget = budgetForTobaccoDivision * (1 - budgetRatioForProductDivision.office);
                increaseReservedFunds(nonOfficesBudget);
                pendingImprovingProductDivisions1.set(
                    DivisionName.TOBACCO,
                    nonOfficesBudget
                );
                console.log(`Upgrade ${DivisionName.TOBACCO}-1, budget: ${ns.formatNumber(nonOfficesBudget)}`);
                console.time(DivisionName.TOBACCO + "-1");
                improveProductDivision(ns,
                    DivisionName.TOBACCO,
                    budgetForTobaccoDivision,
                    true,
                    false,
                    false
                ).catch(reason => {
                    console.error(`Error occurred when upgrading ${DivisionName.TOBACCO}`, reason);
                }).finally(() => {
                    console.timeEnd(DivisionName.TOBACCO + "-1");
                    decreaseReservedFunds(pendingImprovingProductDivisions1.get(DivisionName.TOBACCO) ?? 0);
                    pendingImprovingProductDivisions1.delete(DivisionName.TOBACCO);
                    buyBoostMaterialsIfNeeded(DivisionName.TOBACCO);
                });
            }

            // Upgrade offices of product division
            if (!pendingImprovingProductDivisions2.has(DivisionName.TOBACCO)
                && !preparingToAcceptOffer) {
                const officesBudget = budgetForTobaccoDivision * budgetRatioForProductDivision.office;
                increaseReservedFunds(officesBudget);
                pendingImprovingProductDivisions2.set(DivisionName.TOBACCO, officesBudget);
                console.log(`Upgrade ${DivisionName.TOBACCO}-2, budget: ${ns.formatNumber(officesBudget)}`);
                console.time(DivisionName.TOBACCO + "-2");
                improveProductDivisionOffices(ns,
                    DivisionName.TOBACCO,
                    tobaccoIndustryData,
                    officesBudget,
                    false,
                    false
                ).catch(reason => {
                    console.error(`Error occurred when upgrading ${DivisionName.TOBACCO}`, reason);
                }).finally(() => {
                    console.timeEnd(DivisionName.TOBACCO + "-2");
                    decreaseReservedFunds(pendingImprovingProductDivisions2.get(DivisionName.TOBACCO) ?? 0);
                    pendingImprovingProductDivisions2.delete(DivisionName.TOBACCO);
                });
            }
        }

        const budgetForAgricultureDivision = Math.max(
            Math.min(profit * (currentRound <= 4 ? 0.9 : 0.99), totalFunds * 0.09, availableFunds),
            0
        );
        if (tobaccoHasRevenue
            && needToUpgradeDivision(ns, DivisionName.AGRICULTURE, budgetForAgricultureDivision)
            && !pendingImprovingSupportDivisions.has(DivisionName.AGRICULTURE)) {
            availableFunds -= budgetForAgricultureDivision;
            increaseReservedFunds(budgetForAgricultureDivision);
            pendingImprovingSupportDivisions.set(DivisionName.AGRICULTURE, budgetForAgricultureDivision);
            console.log(`Upgrade ${DivisionName.AGRICULTURE}, budget: ${ns.formatNumber(budgetForAgricultureDivision)}`);
            console.time(DivisionName.AGRICULTURE);
            improveSupportDivision(ns, 
                DivisionName.AGRICULTURE,
                budgetForAgricultureDivision,
                defaultBudgetRatioForSupportDivision,
                false,
                false
            ).catch(reason => {
                console.error(`Error occurred when upgrading ${DivisionName.AGRICULTURE}`, reason);
            }).finally(() => {
                console.timeEnd(DivisionName.AGRICULTURE);
                decreaseReservedFunds(pendingImprovingSupportDivisions.get(DivisionName.AGRICULTURE) ?? 0);
                pendingImprovingSupportDivisions.delete(DivisionName.AGRICULTURE);
                buyBoostMaterialsIfNeeded(DivisionName.AGRICULTURE);
            });
        }
        const budgetForChemicalDivision = Math.max(
            Math.min(profit * (currentRound <= 4 ? 0.1 : 0.01), totalFunds * 0.01, availableFunds),
            0
        );
        if (tobaccoHasRevenue
            && (needToUpgradeDivision(ns, DivisionName.CHEMICAL, budgetForChemicalDivision))
            && !pendingImprovingSupportDivisions.has(DivisionName.CHEMICAL)) {
            availableFunds -= budgetForChemicalDivision;
            increaseReservedFunds(budgetForChemicalDivision);
            pendingImprovingSupportDivisions.set(DivisionName.CHEMICAL, budgetForChemicalDivision);
            console.log(`Upgrade ${DivisionName.CHEMICAL}, budget: ${ns.formatNumber(budgetForChemicalDivision)}`);
            console.time(DivisionName.CHEMICAL);
            improveSupportDivision(ns,
                DivisionName.CHEMICAL,
                budgetForChemicalDivision,
                defaultBudgetRatioForSupportDivision,
                false,
                false
            ).catch(reason => {
                console.error(`Error occurred when upgrading ${DivisionName.CHEMICAL}`, reason);
            }).finally(() => {
                console.timeEnd(DivisionName.CHEMICAL);
                decreaseReservedFunds(pendingImprovingSupportDivisions.get(DivisionName.CHEMICAL) ?? 0);
                pendingImprovingSupportDivisions.delete(DivisionName.CHEMICAL);
                buyBoostMaterialsIfNeeded(DivisionName.CHEMICAL);
            });
        }

        const producedPlants = ns.corporation.getMaterial(DivisionName.AGRICULTURE, mainProductDevelopmentCity, MaterialName.PLANTS).productionAmount;
        const consumedPlants = Math.abs(
            ns.corporation.getMaterial(DivisionName.TOBACCO, mainProductDevelopmentCity, MaterialName.PLANTS).productionAmount
        );
        if (consumedPlants > 0 && producedPlants / consumedPlants < 1) {
            console.debug(`plants ratio: ${producedPlants / consumedPlants}`);
        }

        await waitForNextTimeStateHappens(ns, CorpState.START);
    }
}

function needToUpgradeDivision(ns:NS, divisionName: string, budget: number) {
    const office = ns.corporation.getOffice(divisionName, CityName.Sector12);
    let expectedUpgradeSize = 30;
    if (ns.corporation.getInvestmentOffer().round <= 4) {
        expectedUpgradeSize = Math.min(office.size / 2, 30);
    }
    // Assume that we use entire budget to upgrade offices. This is not correct, but it simplifies the calculation.
    const maxOfficeSize = getMaxAffordableOfficeSize(ns, office.size, budget / 6);
    const needToUpgrade = maxOfficeSize >= office.size + expectedUpgradeSize;
    if (needToUpgrade) {
        console.debug(
            `needToUpgrade ${divisionName}, budget: ${ns.formatNumber(budget)}, office.size: ${office.size}, `
            + `maxOfficeSize: ${maxOfficeSize}}`
        );
    }
    return needToUpgrade;
}

async function switchAllOfficesToProfitSetup(ns:NS, industryData: CorpIndustryData, newestProduct: Product): Promise<void> {
    const mainOffice = ns.corporation.getOffice(DivisionName.TOBACCO, mainProductDevelopmentCity);
    const officeSetup: OfficeSetup = {
        city: mainProductDevelopmentCity,
        size: mainOffice.numEmployees,
        jobs: {
            Operations: 0,
            Engineer: 0,
            Business: 0,
            Management: 0,
            "Research & Development": 0,
        }
    };
    if (usePrecalculatedEmployeeRatioForProfitSetup) {
        const precalculatedEmployeeRatioForProfitSetup =
            (ns.corporation.getInvestmentOffer().round === 3)
                ? precalculatedEmployeeRatioForProfitSetupOfRound3
                : precalculatedEmployeeRatioForProfitSetupOfRound4;
        officeSetup.jobs.Operations = Math.floor(officeSetup.size * precalculatedEmployeeRatioForProfitSetup.operations);
        officeSetup.jobs.Engineer = Math.floor(officeSetup.size * precalculatedEmployeeRatioForProfitSetup.engineer);
        officeSetup.jobs.Business = Math.floor(officeSetup.size * precalculatedEmployeeRatioForProfitSetup.business);
        officeSetup.jobs.Management = officeSetup.size - (officeSetup.jobs.Operations + officeSetup.jobs.Engineer + officeSetup.jobs.Business);
    } else {
        const dataArray = await optimizeOffice(
            ns,
            ns.corporation.getDivision(DivisionName.TOBACCO),
            industryData,
            mainProductDevelopmentCity,
            mainOffice.numEmployees,
            0,
            newestProduct,
            true,
            "profit",
            getBalancingModifierForProfitProgress(ns),
            0, // Do not rerun
            20, // Half of defaultPerformanceModifierForOfficeBenchmark
            false
        );
        const optimalData = dataArray[dataArray.length - 1];
        console.log(`Optimize all offices for "profit"`, optimalData);
        officeSetup.jobs = {
            Operations: optimalData.operations,
            Engineer: optimalData.engineer,
            Business: optimalData.business,
            Management: optimalData.management,
            "Research & Development": 0,
        };
    }
    assignJobs(
        ns,
        DivisionName.TOBACCO,
        [officeSetup]
    );
    // Reuse the ratio of main office. This is not entirely correct, but it's still good enough. We do
    // this to reduce the computing time needed to find and switch to the optimal office setups.
    for (const city of supportProductDevelopmentCities) {
        const office = ns.corporation.getOffice(DivisionName.TOBACCO, city);
        const operations = Math.max(
            Math.floor(office.numEmployees * (officeSetup.jobs.Operations / mainOffice.numEmployees)), 1
        );
        const engineer = Math.max(
            Math.floor(office.numEmployees * (officeSetup.jobs.Engineer / mainOffice.numEmployees)), 1
        );
        const business = Math.max(
            Math.floor(office.numEmployees * (officeSetup.jobs.Business / mainOffice.numEmployees)), 1
        );
        const management = office.numEmployees - (operations + engineer + business);
        assignJobs(
            ns,
            DivisionName.TOBACCO,
            [
                {
                    city: city,
                    size: office.numEmployees,
                    jobs: {
                        Operations: operations,
                        Engineer: engineer,
                        Business: business,
                        Management: management,
                        "Research & Development": 0,
                    }
                }
            ]
        );
    }
}

async function buyResearch(ns:NS): Promise<void> {
    // Do not buy any research in round 3
    if (ns.corporation.getInvestmentOffer().round <= 3) {
        return;
    }
    const buyResearches = (divisionName: string) => {
        let researchPriorities: ResearchPriority[];
        if (divisionName === DivisionName.AGRICULTURE || divisionName === DivisionName.CHEMICAL) {
            researchPriorities = researchPrioritiesForSupportDivision;
        } else {
            researchPriorities = researchPrioritiesForProductDivision;
        }
        for (const researchPriority of researchPriorities) {
            // Only buy R&D Laboratory in round 4
            if (ns.corporation.getInvestmentOffer().round === 4
                && researchPriority.research !== ResearchName.HI_TECH_RND_LABORATORY) {
                break;
            }
            if (ns.corporation.hasResearched(divisionName, researchPriority.research)) {
                continue;
            }
            const researchCost = ns.corporation.getResearchCost(divisionName, researchPriority.research);
            if (ns.corporation.getDivision(divisionName).researchPoints < researchCost * researchPriority.costMultiplier) {
                break;
            }
            ns.corporation.research(divisionName, researchPriority.research);
        }
    };

    buyResearches(DivisionName.AGRICULTURE);
    buyResearches(DivisionName.CHEMICAL);
    buyResearches(DivisionName.TOBACCO);
}
