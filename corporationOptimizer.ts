import { Ceres } from "./ceres";
import { CeresSolverResult, CityName, CorpMaterialsData, CorpResearchesData, CorpState, CorpUpgradesData, 
CorporationUpgradeLevels, DivisionName, DivisionResearches, EmployeePosition, IndustryType, MaterialName, 
OfficeSetup, OfficeSetupJobs, ResearchName, UnlockName, UpgradeName, boostMaterials, cities } from "./corpconsts";
import { dummyDivisionNamePrefix, getAdvertisingFactors, getBusinessFactor, getMarketFactor, getProductIdArray, getRecordEntries, 
getResearchMultiplier, getResearchSalesMultiplier, getUpgradeBenefit, isProduct, stockMaterials, 
waitForNextTimeStateHappens } from "./corputils";
import { log } from "./helpers";
import { PriorityQueue } from "./priorityQueue";

export const sampleProductName = "Sample product";
export const productMarketPriceMultiplier = 5;

const defaultLengthOfBenchmarkDataArray = 10;
const advertUpgradeBasePrice = 1e9;
const numberSuffixList = ["", "k", "m", "b", "t", "q", "Q", "s", "S", "o", "n"];
const numberExpList = numberSuffixList.map((_, i) => parseFloat(`1e${i * 3}`));
const awarenessMap = new Map<string, number>();
const popularityMap = new Map<string, number>();
export const defaultPerformanceModifierForOfficeBenchmark = 40;
export const minStepForOfficeBenchmark = 2;
export const productMarkupData: Map<string, number> = new Map<string, number>();
export const thresholdOfFocusingOnAdvert = 1e18;
export const defaultBudgetRatioForSupportDivision = {
    warehouse: 0.1,
    office: 0.9
};
type Workload = (
    worker: Worker,
    workerWrapper: CorporationOptimizer,
    operationsJob: {
        min: number;
        max: number;
    },
    engineerJob: {
        min: number;
        max: number;
    },
    managementJob: {
        min: number;
        max: number;
    }
) => Promise<void>;

export const defaultBudgetRatioForProductDivision = {
    rawProduction: 1 / 23,
    wilsonAdvert: 4 / 23,
    office: 8 / 23,
    employeeStatUpgrades: 8 / 23,
    salesBot: 1 / 23,
    projectInsight: 1 / 23,
};

export const budgetRatioForProductDivisionWithoutAdvert = {
    rawProduction: 1 / 19,
    wilsonAdvert: 0,
    office: 8 / 19,
    employeeStatUpgrades: 8 / 19,
    salesBot: 1 / 19,
    projectInsight: 1 / 19,
};
export let budgetRatioForProductDivision = defaultBudgetRatioForProductDivision;

export const numberFormat = new Intl.NumberFormat(
    "en",
    {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3
    }
);
const basicFormatter = new Intl.NumberFormat(
    "en"
);
const exponentialFormatter = new Intl.NumberFormat(
    "en",
    {
        notation: "scientific"
    }
);
export enum BenchmarkType {
    STORAGE_FACTORY,
    WILSON_ADVERT,
    OFFICE
}

export interface StorageFactoryBenchmarkData {
    smartStorageLevel: number;
    warehouseLevel: number;
    smartFactoriesLevel: number;
    upgradeSmartStorageCost: number;
    upgradeWarehouseCost: number;
    warehouseSize: number;
    totalCost: number;
    production: number;
    costPerProduction: number;
    boostMaterials: number[];
    boostMaterialMultiplier: number;
}

export interface WilsonAdvertBenchmarkData {
    wilsonLevel: number;
    advertLevel: number;
    totalCost: number;
    popularity: number;
    awareness: number;
    ratio: number;
    advertisingFactor: number;
    costPerAdvertisingFactor: number;
}

export interface OfficeBenchmarkData {
    operations: number;
    engineer: number;
    business: number;
    management: number;
    totalExperience: number;
    rawProduction: number;
    maxSalesVolume: number;
    optimalPrice: number;
    productDevelopmentProgress: number;
    estimatedRP: number;
    productRating: number;
    productMarkup: number;
    profit: number;
}

export type OfficeBenchmarkSortType = "rawProduction" | "progress" | "profit" | "profit_progress";

export interface OfficeBenchmarkCustomData {
    office: {
        avgMorale: number;
        avgEnergy: number;
        avgIntelligence: number;
        avgCharisma: number;
        avgCreativity: number;
        avgEfficiency: number;
        totalExperience: number;
    };
    corporationUpgradeLevels: CorporationUpgradeLevels;
    divisionResearches: DivisionResearches;
    performanceModifier: number;
}

export interface EmployeeJobRequirement {
    engineer: number;
    business: number;
}

export interface ComparatorCustomData {
    referenceData: OfficeBenchmarkData;
    balancingModifierForProfitProgress: {
        profit: number;
        progress: number;
    };
}

export function getMaxAffordableAdVertLevel(ns:NS, fromLevel: number, maxCost: number): number {
    return getGenericMaxAffordableUpgradeLevel(ns, advertUpgradeBasePrice, 1.06, fromLevel, maxCost);
}

export type BalancingModifierForProfitProgress = ComparatorCustomData["balancingModifierForProfitProgress"];

const defaultMinForNormalization = 5;
const defaultMaxForNormalization = 200;
const referenceValueModifier = 10;

export const precalculatedEmployeeRatioForSupportDivisions = {
    operations: 0.22,
    engineer: 0.632,
    business: 0,
    management: 0.148
};

export const precalculatedEmployeeRatioForProfitSetupOfRound3 = {
    operations: 49 / 138, // 0.35507246376811594202898550724638
    engineer: 5 / 138, // 0.03623188405797101449275362318841
    business: 51 / 138, // 0.36956521739130434782608695652174
    management: 33 / 138 // 0.23913043478260869565217391304348
};

export const precalculatedEmployeeRatioForProfitSetupOfRound4 = {
    operations: 68 / 369, // 0.18428184281842818428184281842818
    engineer: 12 / 369, // 0.03252032520325203252032520325203
    business: 244 / 369, // 0.66124661246612466124661246612466
    management: 45 / 369 // 0.12195121951219512195121951219512
};

export const precalculatedEmployeeRatioForProductDivisionRound3 = {
    operations: 0.037,
    engineer: 0.513,
    business: 0.011,
    management: 0.44
};

export const precalculatedEmployeeRatioForProductDivisionRound4 = {
    operations: 0.03,
    engineer: 0.531,
    business: 0.003,
    management: 0.436
};

export const precalculatedEmployeeRatioForProductDivisionRound5_1 = {
    operations: 0.032,
    engineer: 0.462,
    business: 0.067,
    management: 0.439
};

export const precalculatedEmployeeRatioForProductDivisionRound5_2 = {
    operations: 0.064,
    engineer: 0.317,
    business: 0.298,
    management: 0.321
};

export function getMaxAffordableUpgradeLevel(ns:NS, upgradeName: CorpUpgradeName, fromLevel: number, maxCost: number): number {
    const upgradeData = CorpUpgradesData[upgradeName];
    if (!upgradeData) {
        throw new Error(`Cannot find data of upgrade: ${upgradeName}`);
    }
    return getGenericMaxAffordableUpgradeLevel(ns, upgradeData.basePrice, upgradeData.priceMult, fromLevel, maxCost);
}



export function getResearchRPMultiplier(divisionResearches: DivisionResearches): number {
    return getResearchMultiplier(divisionResearches, "sciResearchMult");
}

export function getOptimalBoostMaterialQuantities(
    industryData: CorpIndustryData,
    spaceConstraint: number,
    round: boolean = true
): number[] {
    const { aiCoreFactor, hardwareFactor, realEstateFactor, robotFactor } = industryData;
    const boostMaterialCoefficients = [aiCoreFactor!, hardwareFactor!, realEstateFactor!, robotFactor!];
    const boostMaterialSizes = boostMaterials.map(mat => CorpMaterialsData[mat].size);

    const calculateOptimalQuantities = (
        matCoefficients: number[],
        matSizes: number[]
    ): number[] => {
        const sumOfCoefficients = matCoefficients.reduce((a, b) => a + b, 0);
        const sumOfSizes = matSizes.reduce((a, b) => a + b, 0);
        const result = [];
        for (let i = 0; i < matSizes.length; ++i) {
            let matCount =
                (spaceConstraint - 500 * ((matSizes[i] / matCoefficients[i]) * (sumOfCoefficients - matCoefficients[i]) - (sumOfSizes - matSizes[i])))
                / (sumOfCoefficients / matCoefficients[i])
                / matSizes[i];
            if (matCoefficients[i] <= 0 || matCount < 0) {
                return calculateOptimalQuantities(
                    matCoefficients.toSpliced(i, 1),
                    matSizes.toSpliced(i, 1)
                ).toSpliced(i, 0, 0);
            } else {
                if (round) {
                    matCount = Math.round(matCount);
                }
                result.push(matCount);
            }
        }
        return result;
    };
    return calculateOptimalQuantities(boostMaterialCoefficients, boostMaterialSizes);
}

export const warehouseUpgradeBasePrice = 1e9;

export function formatNumber(value: number): string {
    const fractionalDigits = 3;
    // NaN does not get formatted
    if (Number.isNaN(value)) {
        return "NaN";
    }
    const nAbs = Math.abs(value);

    // Special handling for Infinities
    if (nAbs === Infinity) {
        return value < 0 ? "-∞" : "∞";
    }

    // Early return for non-suffix
    if (nAbs < 1000) {
        return basicFormatter.format(value);
    }

    // Exponential form
    if (nAbs >= 1e15) {
        return exponentialFormatter.format(value).toLocaleLowerCase();
    }

    // Calculate suffix index. 1000 = 10^3
    let suffixIndex = Math.floor(Math.log10(nAbs) / 3);

    value /= numberExpList[suffixIndex];
    // Detect if number rounds to 1000.000 (based on number of digits given)
    if (Math.abs(value).toFixed(fractionalDigits).length === fractionalDigits + 5 && numberSuffixList[suffixIndex + 1]) {
        suffixIndex += 1;
        value = value < 0 ? -1 : 1;
    }
    return numberFormat.format(value) + numberSuffixList[suffixIndex];
}

export function getGenericMaxAffordableUpgradeLevel(ns:NS,
    basePrice: number,
    priceMultiplier: number,
    fromLevel: number,
    maxCost: number,
    roundingWithFloor = true): number {
    const maxAffordableUpgradeLevel = Math.log(
        maxCost * (priceMultiplier - 1) / basePrice + Math.pow(priceMultiplier, fromLevel)
    ) / Math.log(priceMultiplier);
    if (roundingWithFloor) {
        return Math.floor(
            maxAffordableUpgradeLevel
        );
    }
    return maxAffordableUpgradeLevel;
}

export function getMaxAffordableWarehouseLevel(fromLevel: number, maxCost: number): number {
    if (fromLevel < 1) {
        throw new Error("Invalid parameter");
    }
    return Math.floor(
        (Math.log(maxCost * 0.07 / warehouseUpgradeBasePrice + Math.pow(1.07, fromLevel + 1)) / Math.log(1.07)) - 1
    );
}

export function getComparator(benchmarkType: BenchmarkType, sortType?: string, customData?: ComparatorCustomData): (a: any, b: any) => number {
    switch (benchmarkType) {
        case BenchmarkType.STORAGE_FACTORY:
            return (a: StorageFactoryBenchmarkData, b: StorageFactoryBenchmarkData) => {
                if (!a || !b) {
                    return 1;
                }
                if (a.production !== b.production) {
                    return a.production - b.production;
                }
                return b.totalCost - a.totalCost;
            };
        case BenchmarkType.WILSON_ADVERT:
            return (a: WilsonAdvertBenchmarkData, b: WilsonAdvertBenchmarkData) => {
                if (!a || !b) {
                    return 1;
                }
                if (sortType === "totalCost") {
                    return b.totalCost - a.totalCost;
                }
                if (a.advertisingFactor !== b.advertisingFactor) {
                    return a.advertisingFactor - b.advertisingFactor;
                }
                return b.totalCost - a.totalCost;
            };
        case BenchmarkType.OFFICE:
            return (a: OfficeBenchmarkData, b: OfficeBenchmarkData) => {
                if (!a || !b) {
                    return 1;
                }
                if (a.totalExperience !== b.totalExperience) {
                    return a.totalExperience - b.totalExperience;
                }
                if (sortType === "rawProduction") {
                    return a.rawProduction - b.rawProduction;
                }
                if (sortType === "progress") {
                    return a.productDevelopmentProgress - b.productDevelopmentProgress;
                }
                if (sortType === "profit") {
                    return a.profit - b.profit;
                }
                if (!customData) {
                    throw new Error(`Invalid custom data`);
                }
                const normalizedProfitOfA = normalizeProfit(a.profit, customData.referenceData.profit);
                const normalizedProgressOfA = normalizeProgress(Math.ceil(100 / a.productDevelopmentProgress));
                const normalizedProfitOfB = normalizeProfit(b.profit, customData.referenceData.profit);
                const normalizedProgressOfB = normalizeProgress(Math.ceil(100 / b.productDevelopmentProgress));
                if (!Number.isFinite(normalizedProfitOfA) || !Number.isFinite(normalizedProfitOfB)) {
                    throw new Error(
                        `Invalid profit: a.profit: ${a.profit.toExponential()}, b.profit: ${b.profit.toExponential()}`
                        + `, referenceData.profit: ${customData.referenceData.profit.toExponential()}`
                    );
                }
                if (sortType === "profit_progress") {
                    return (customData.balancingModifierForProfitProgress.profit * normalizedProfitOfA
                        - customData.balancingModifierForProfitProgress.progress * normalizedProgressOfA)
                        - (customData.balancingModifierForProfitProgress.profit * normalizedProfitOfB
                            - customData.balancingModifierForProfitProgress.progress * normalizedProgressOfB);
                }
                throw new Error(`Invalid sort type: ${sortType}`);
            };
        default:
            throw new Error(`Invalid benchmark type`);
    }
}

export function scaleValueToRange(value: number, currentMin: number, currentMax: number, newMin: number, newMax: number): number {
    return ((value - currentMin) * (newMax - newMin) / (currentMax - currentMin)) + newMin;
}

export function normalizeProfit(profit: number, referenceValue: number): number {
    return scaleValueToRange(
        profit,
        referenceValue / referenceValueModifier,
        referenceValue * referenceValueModifier,
        defaultMinForNormalization,
        defaultMaxForNormalization
    );
}

export function normalizeProgress(progress: number): number {
    return scaleValueToRange(progress, 0, 100, defaultMinForNormalization, defaultMaxForNormalization);
}

function getGenericUpgradeCost(basePrice: number, priceMultiplier: number, fromLevel: number, toLevel: number): number {
    return basePrice * ((Math.pow(priceMultiplier, toLevel) - Math.pow(priceMultiplier, fromLevel)) / (priceMultiplier - 1));
}

export function getUpgradeCost(upgradeName: CorpUpgradeName, fromLevel: number, toLevel: number): number {
    const upgradeData = CorpUpgradesData[upgradeName];
    if (!upgradeData) {
        throw new Error(`Cannot find data of upgrade: ${upgradeName}`);
    }
    return getGenericUpgradeCost(upgradeData.basePrice, upgradeData.priceMult, fromLevel, toLevel);
}


export function getUpgradeWarehouseCost(fromLevel: number, toLevel: number): number {
    if (fromLevel < 1) {
        throw new Error("Invalid parameter");
    }
    return warehouseUpgradeBasePrice * ((Math.pow(1.07, toLevel + 1) - Math.pow(1.07, fromLevel + 1)) / 0.07);
}

export function getResearchStorageMultiplier(divisionResearches: DivisionResearches): number {
    return getResearchMultiplier(divisionResearches, "storageMult");
}

export function getWarehouseSize(smartStorageLevel: number, warehouseLevel: number, divisionResearches: DivisionResearches): number {
    return warehouseLevel * 100 *
        (1 + CorpUpgradesData[UpgradeName.SMART_STORAGE].benefit * smartStorageLevel) *
        getResearchStorageMultiplier(divisionResearches);
}

export function getResearchAdvertisingMultiplier(divisionResearches: DivisionResearches): number {
    return getResearchMultiplier(divisionResearches, "advertisingMult");
}

export function getAdVertCost(fromLevel: number, toLevel: number): number {
    return getGenericUpgradeCost(advertUpgradeBasePrice, 1.06, fromLevel, toLevel);
}

export function getDivisionProductionMultiplier(industryData: CorpIndustryData, boostMaterials: number[]) {
    const cityMultiplier =
        Math.pow(0.002 * boostMaterials[0] + 1, industryData.aiCoreFactor!) *
        Math.pow(0.002 * boostMaterials[1] + 1, industryData.hardwareFactor!) *
        Math.pow(0.002 * boostMaterials[2] + 1, industryData.realEstateFactor!) *
        Math.pow(0.002 * boostMaterials[3] + 1, industryData.robotFactor!);
    return Math.max(Math.pow(cityMultiplier, 0.73), 1) * 6;
}

export class CorporationOptimizer {
    //public getScriptUrl(): string {
    //    return import.meta.url;
    //}

    public optimizeStorageAndFactory(ns: NS,
        industryData: CorpIndustryData,
        currentSmartStorageLevel: number,
        currentWarehouseLevel: number,
        currentSmartFactoriesLevel: number,
        divisionResearches: DivisionResearches,
        maxCost: number,
        enableLogging = false,
        boostMaterialTotalSizeRatio = 0.8
    ): StorageFactoryBenchmarkData[] {
        if (currentSmartStorageLevel < 0 || currentWarehouseLevel < 0 || currentSmartFactoriesLevel < 0) {
            throw new Error("Invalid parameter");
        }
        //const logger = new Logger(enableLogging);
        //log(ns, `currentSmartStorageLevel: ${currentSmartStorageLevel} maxCost: ${maxCost}`, true, 'info');
        const maxSmartStorageLevel = getMaxAffordableUpgradeLevel(ns, UpgradeName.SMART_STORAGE, currentSmartStorageLevel, maxCost);
        const maxWarehouseLevel = getMaxAffordableWarehouseLevel(currentWarehouseLevel, maxCost / 6);
        const comparator = getComparator(BenchmarkType.STORAGE_FACTORY);
        const priorityQueue = new PriorityQueue(comparator);
        let minSmartStorageLevel = currentSmartStorageLevel;
        if (maxSmartStorageLevel - minSmartStorageLevel > 1000) {
            minSmartStorageLevel = maxSmartStorageLevel - 1000;
        }
        let minWarehouseLevel = currentWarehouseLevel;
        if (maxWarehouseLevel - minWarehouseLevel > 1000) {
            minWarehouseLevel = maxWarehouseLevel - 1000;
        }
        //log(ns, `minSmartStorageLevel: ${minSmartStorageLevel}`, true, 'info');
        //log(ns, `minWarehouseLevel: ${minWarehouseLevel}`, true, 'info');
        //log(ns, `maxSmartStorageLevel: ${maxSmartStorageLevel}`, true, 'info');
        //log(ns, `maxWarehouseLevel: ${maxWarehouseLevel}`, true, 'info');
        for (let smartStorageLevel = minSmartStorageLevel; smartStorageLevel <= maxSmartStorageLevel; smartStorageLevel++) {
            const upgradeSmartStorageCost = getUpgradeCost(
                UpgradeName.SMART_STORAGE,
                currentSmartStorageLevel,
                smartStorageLevel
            );
            for (let warehouseLevel = minWarehouseLevel; warehouseLevel <= maxWarehouseLevel; warehouseLevel++) {
                const upgradeWarehouseCost = getUpgradeWarehouseCost(
                    currentWarehouseLevel,
                    warehouseLevel
                ) * 6;
                if (upgradeSmartStorageCost + upgradeWarehouseCost > maxCost) {
                    break;
                }
                const warehouseSize = getWarehouseSize(
                    smartStorageLevel,
                    warehouseLevel,
                    divisionResearches
                );
                const boostMaterials = getOptimalBoostMaterialQuantities(industryData, warehouseSize * boostMaterialTotalSizeRatio);
                const boostMaterialMultiplier = getDivisionProductionMultiplier(industryData, boostMaterials);
                const budgetForSmartFactoriesUpgrade = maxCost - (upgradeSmartStorageCost + upgradeWarehouseCost);
                const maxAffordableSmartFactoriesLevel = getMaxAffordableUpgradeLevel(ns,
                    UpgradeName.SMART_FACTORIES,
                    currentSmartFactoriesLevel,
                    budgetForSmartFactoriesUpgrade
                );
                const upgradeSmartFactoriesCost = getUpgradeCost(
                    UpgradeName.SMART_FACTORIES,
                    currentSmartFactoriesLevel,
                    maxAffordableSmartFactoriesLevel
                );
                const totalCost = upgradeSmartStorageCost + upgradeWarehouseCost + upgradeSmartFactoriesCost;
                const smartFactoriesMultiplier = 1 + CorpUpgradesData[UpgradeName.SMART_FACTORIES].benefit * maxAffordableSmartFactoriesLevel;
                const production = boostMaterialMultiplier * smartFactoriesMultiplier;
                const dataEntry = {
                    smartStorageLevel: smartStorageLevel,
                    warehouseLevel: warehouseLevel,
                    smartFactoriesLevel: maxAffordableSmartFactoriesLevel,
                    upgradeSmartStorageCost: upgradeSmartStorageCost,
                    upgradeWarehouseCost: upgradeWarehouseCost,
                    warehouseSize: warehouseSize,
                    totalCost: totalCost,
                    production: production,
                    costPerProduction: totalCost / production,
                    boostMaterials: boostMaterials,
                    boostMaterialMultiplier: boostMaterialMultiplier
                };
                if (priorityQueue.size() < defaultLengthOfBenchmarkDataArray) {
                    priorityQueue.push(dataEntry);
                } else if (comparator(dataEntry, priorityQueue.front()) > 0) {
                    priorityQueue.pop();
                    priorityQueue.push(dataEntry);
                }
            }
        }
        const data: StorageFactoryBenchmarkData[] = priorityQueue.toArray();
        /*data.forEach(data => {
            log(ns, 
                `{storage:${data.smartStorageLevel}, warehouse:${data.warehouseLevel}, factory:${data.smartFactoriesLevel}, ` +
                `totalCost:${formatNumber(data.totalCost)}, ` +
                `warehouseSize:${formatNumber(data.warehouseSize)}, ` +
                `production:${formatNumber(data.production)}, ` +
                `costPerProduction:${formatNumber(data.costPerProduction)}, ` +
                `boostMaterialMultiplier:${formatNumber(data.boostMaterialMultiplier)}, ` +
                `boostMaterials:${data.boostMaterials}}`
            , true, 'info');
        });*/
        return data;
    }

    public optimizeWilsonAndAdvert(ns: NS,
        industryData: CorpIndustryData,
        currentWilsonLevel: number,
        currentAdvertLevel: number,
        currentAwareness: number,
        currentPopularity: number,
        divisionResearches: DivisionResearches,
        maxCost: number,
        enableLogging = false
    ): WilsonAdvertBenchmarkData[] {
        awarenessMap.clear();
        popularityMap.clear();
        if (currentWilsonLevel < 0 || currentAdvertLevel < 0) {
            throw new Error("Invalid parameter");
        }
        const maxWilsonLevel = getMaxAffordableUpgradeLevel(ns, UpgradeName.WILSON_ANALYTICS, currentWilsonLevel, maxCost);
        const maxAdvertLevel = getMaxAffordableAdVertLevel(ns, currentAdvertLevel, maxCost);
        log(ns,`maxWilsonLevel: ${maxWilsonLevel}`, true, 'info');
        log(ns,`maxAdvertLevel: ${maxAdvertLevel}`, true, 'info');
        const researchAdvertisingMultiplier = getResearchAdvertisingMultiplier(divisionResearches);
        const comparator = getComparator(BenchmarkType.WILSON_ADVERT);
        const priorityQueue = new PriorityQueue(comparator);
        for (let wilsonLevel = currentWilsonLevel; wilsonLevel <= maxWilsonLevel; wilsonLevel++) {
            const wilsonCost = getUpgradeCost(UpgradeName.WILSON_ANALYTICS, currentWilsonLevel, wilsonLevel);
            for (let advertLevel = currentAdvertLevel + 1; advertLevel <= maxAdvertLevel; advertLevel++) {
                const advertCost = getAdVertCost(currentAdvertLevel, advertLevel);
                const totalCost = wilsonCost + advertCost;
                if (totalCost > maxCost) {
                    break;
                }
                const previousAwareness = awarenessMap.get(`${wilsonLevel}|${advertLevel - 1}`) ?? currentAwareness;
                const previousPopularity = popularityMap.get(`${wilsonLevel}|${advertLevel - 1}`) ?? currentPopularity;
                const advertisingMultiplier = (1 + CorpUpgradesData[UpgradeName.WILSON_ANALYTICS].benefit * wilsonLevel) * researchAdvertisingMultiplier;
                let awareness = (previousAwareness + 3 * advertisingMultiplier) * (1.005 * advertisingMultiplier);
                // Hard-coded value of getRandomInt(1, 3). We don't want RNG here.
                // let popularity = (previousPopularity + advertisingMultiplier) * ((1 + getRandomInt(1, 3) / 200) * advertisingMultiplier);
                let popularity = (previousPopularity + advertisingMultiplier) * ((1 + 2 / 200) * advertisingMultiplier);
                awareness = Math.min(awareness, Number.MAX_VALUE);
                popularity = Math.min(popularity, Number.MAX_VALUE);
                awarenessMap.set(`${wilsonLevel}|${advertLevel}`, awareness);
                popularityMap.set(`${wilsonLevel}|${advertLevel}`, popularity);
                const [advertisingFactor] = getAdvertisingFactors(awareness, popularity, industryData.advertisingFactor!);
                const dataEntry = {
                    wilsonLevel: wilsonLevel,
                    advertLevel: advertLevel,
                    totalCost: totalCost,
                    popularity: popularity,
                    awareness: awareness,
                    ratio: (popularity / awareness),
                    advertisingFactor: advertisingFactor,
                    costPerAdvertisingFactor: totalCost / advertisingFactor
                };
                if (priorityQueue.size() < defaultLengthOfBenchmarkDataArray) {
                    priorityQueue.push(dataEntry);
                } else if (comparator(dataEntry, priorityQueue.front()) > 0) {
                    priorityQueue.pop();
                    priorityQueue.push(dataEntry);
                }
            }
        }
        const data: WilsonAdvertBenchmarkData[] = priorityQueue.toArray();
        /*data.forEach(data => {
            log(ns,
                `{wilson:${data.wilsonLevel}, advert:${data.advertLevel}, ` +
                `totalCost:${formatNumber(data.totalCost)}, ` +
                `advertisingFactor:${formatNumber(data.advertisingFactor)}, ` +
                `popularity:${formatNumber(data.popularity)}, ` +
                `awareness:${formatNumber(data.awareness)}, ` +
                `ratio:${formatNumber(data.ratio)}, ` +
                `costPerAdvertisingFactor:${formatNumber(data.costPerAdvertisingFactor)}}`
            , true, 'info');
        });*/
        return data;
    }

    public async optimizeOffice(ns: NS,
        division: Division,
        industryData: CorpIndustryData,
        operationsJob: {
            min: number;
            max: number;
        },
        engineerJob: {
            min: number;
            max: number;
        },
        managementJob: {
            min: number;
            max: number;
        },
        rndEmployee: number,
        nonRnDEmployees: number,
        item: Material | Product,
        useCurrentItemData: boolean,
        customData: OfficeBenchmarkCustomData,
        sortType: OfficeBenchmarkSortType,
        comparatorCustomData: ComparatorCustomData,
        enableLogging = false,
        employeeJobsRequirement?: EmployeeJobRequirement
    ): Promise<{ step: number; data: OfficeBenchmarkData[]; }> {
        const salesBotUpgradeBenefit = getUpgradeBenefit(
            UpgradeName.ABC_SALES_BOTS,
            customData.corporationUpgradeLevels[UpgradeName.ABC_SALES_BOTS]
        );
        const researchSalesMultiplier = getResearchSalesMultiplier(customData.divisionResearches);

        let performanceModifier = defaultPerformanceModifierForOfficeBenchmark;
        if (customData.performanceModifier) {
            performanceModifier = customData.performanceModifier;
        }
        const operationsStep = Math.max(
            Math.floor((operationsJob.max - operationsJob.min) / performanceModifier),
            minStepForOfficeBenchmark
        );
        const engineerStep = Math.max(
            Math.floor((engineerJob.max - engineerJob.min) / performanceModifier),
            minStepForOfficeBenchmark
        );
        const managementStep = Math.max(
            Math.floor((managementJob.max - managementJob.min) / performanceModifier),
            minStepForOfficeBenchmark
        );
        const maxStep = Math.max(
            operationsStep,
            engineerStep,
            managementStep,
        );

        const comparator = getComparator(BenchmarkType.OFFICE, sortType, comparatorCustomData);
        const priorityQueue = new PriorityQueue(comparator);
        // We use maxStep for all loops instead of specific step for each loop to maximize performance. The result is
        // still good enough.
        for (let operations = operationsJob.min; operations <= operationsJob.max; operations += maxStep) {
            for (let engineer = engineerJob.min; engineer <= engineerJob.max; engineer += maxStep) {
                for (let management = managementJob.min; management <= managementJob.max; management += maxStep) {
                    if (operations + engineer === 0
                        || operations + engineer + management >= nonRnDEmployees) {
                        continue;
                    }
                    let effectiveEngineer = engineer;
                    let business = nonRnDEmployees - (operations + engineer + management);
                    if (employeeJobsRequirement) {
                        // Currently, we only set employeeJobsRequirement when we find optimal setup for support divisions.
                        // In this case, employeeJobsRequirement.business is always 0.
                        if (employeeJobsRequirement.business !== 0) {
                            throw new Error(`Invalid valid of employeeJobsRequirement.business: ${employeeJobsRequirement.business}`);
                        }
                        // "Transfer" business to engineer. Engineer is important for quality of output materials of
                        // support divisions.
                        effectiveEngineer += business;
                        business = 0;
                    }
                    const dataEntry = await calculateOfficeBenchmarkData(ns,
                        division,
                        industryData,
                        item,
                        useCurrentItemData,
                        customData,
                        operations,
                        effectiveEngineer,
                        business,
                        management,
                        rndEmployee,
                        salesBotUpgradeBenefit,
                        researchSalesMultiplier,
                        enableLogging
                    );
                    if (priorityQueue.size() < defaultLengthOfBenchmarkDataArray) {
                        priorityQueue.push(dataEntry);
                    } else if (comparator(dataEntry, priorityQueue.front()) > 0) {
                        priorityQueue.pop();
                        priorityQueue.push(dataEntry);
                    }
                }
            }
        }
        return {
            step: maxStep,
            data: priorityQueue.toArray()
        };
    }
}

export async function calculateOfficeBenchmarkData(ns: NS,
    division: Division,
    industryData: CorpIndustryData,
    item: Material | Product,
    useCurrentItemData: boolean,
    customData: {
        office: {
            avgMorale: number;
            avgEnergy: number;
            avgIntelligence: number;
            avgCharisma: number;
            avgCreativity: number;
            avgEfficiency: number;
            totalExperience: number;
        };
        corporationUpgradeLevels: CorporationUpgradeLevels;
        divisionResearches: DivisionResearches;
        step?: number;
    },
    operations: number,
    engineer: number,
    business: number,
    management: number,
    rnd: number,
    salesBotUpgradeBenefit: number,
    researchSalesMultiplier: number,
    enableLogging = false
): Promise<OfficeBenchmarkData> {
    const itemIsProduct = isProduct(item);
    const employeesProduction = getEmployeeProductionByJobs(
        {
            avgIntelligence: customData.office.avgIntelligence,
            avgCharisma: customData.office.avgCharisma,
            avgCreativity: customData.office.avgCreativity,
            avgEfficiency: customData.office.avgEfficiency,
            avgMorale: customData.office.avgMorale,
            avgEnergy: customData.office.avgEnergy,
            totalExperience: customData.office.totalExperience,
            employeeJobs: {
                operations: operations,
                engineer: engineer,
                business: business,
                management: management,
                researchAndDevelopment: rnd,
                intern: 0,
                unassigned: 0
            }
        },
        customData.corporationUpgradeLevels,
        customData.divisionResearches
    );
    const rawProduction = getDivisionRawProduction(
        itemIsProduct,
        {
            operationsProduction: employeesProduction.operationsProduction,
            engineerProduction: employeesProduction.engineerProduction,
            managementProduction: employeesProduction.managementProduction,
        },
        division.productionMult,
        customData.corporationUpgradeLevels,
        customData.divisionResearches
    );

    let productDevelopmentProgress = 0;
    let estimatedRP = 0;
    let productEffectiveRating = 0;
    let productMarkup = 0;
    let demand: number;
    let competition: number;

    let itemMultiplier: number;
    let markupLimit: number;
    let marketPrice: number;

    if (itemIsProduct) {
        // Calculate progress
        const totalProductionForProductDev = employeesProduction.operationsProduction
            + employeesProduction.engineerProduction
            + employeesProduction.managementProduction;
        const managementFactor = 1 + employeesProduction.managementProduction / (1.2 * totalProductionForProductDev);
        productDevelopmentProgress = 0.01 * (
            Math.pow(employeesProduction.engineerProduction, 0.34)
            + Math.pow(employeesProduction.operationsProduction, 0.2)
        )
            * managementFactor;

        if (!useCurrentItemData) {
            // Estimate RP gain
            const cycles = 100 / productDevelopmentProgress;
            const employeesProductionInSupportCities = getEmployeeProductionByJobs(
                {
                    // Reuse employees' stats of main office. This is fine because we only calculate the estimated value,
                    // not the exact value.
                    avgIntelligence: customData.office.avgIntelligence,
                    avgCharisma: customData.office.avgCharisma,
                    avgCreativity: customData.office.avgCreativity,
                    avgEfficiency: customData.office.avgEfficiency,
                    avgMorale: customData.office.avgMorale,
                    avgEnergy: customData.office.avgEnergy,
                    totalExperience: customData.office.totalExperience,
                    employeeJobs: {
                        operations: 1,
                        engineer: 1,
                        business: 1,
                        management: 1,
                        researchAndDevelopment: operations + engineer + business + management - 4,
                        intern: 0,
                        unassigned: 0
                    }
                },
                customData.corporationUpgradeLevels,
                customData.divisionResearches
            );
            const researchPointGainPerCycle =
                5 // 5 support cities
                * 4 * 0.004 * Math.pow(employeesProductionInSupportCities.researchAndDevelopmentProduction, 0.5)
                * getUpgradeBenefit(UpgradeName.PROJECT_INSIGHT, customData.corporationUpgradeLevels[UpgradeName.PROJECT_INSIGHT])
                * getResearchRPMultiplier(customData.divisionResearches);
            estimatedRP = division.researchPoints + researchPointGainPerCycle * cycles;

            // Calculate product.stats
            const productStats: Record<string, number> = {
                quality: 0,
                performance: 0,
                durability: 0,
                reliability: 0,
                aesthetics: 0,
                features: 0,
            };
            // If we assume that office setup does not change, we can use employeesProduction instead of creationJobFactors
            const totalProduction =
                employeesProduction.engineerProduction
                + employeesProduction.managementProduction
                + employeesProduction.researchAndDevelopmentProduction
                + employeesProduction.operationsProduction
                + employeesProduction.businessProduction;

            const engineerRatio = employeesProduction.engineerProduction / totalProduction;
            const managementRatio = employeesProduction.managementProduction / totalProduction;
            const researchAndDevelopmentRatio = employeesProduction.researchAndDevelopmentProduction / totalProduction;
            const operationsRatio = employeesProduction.operationsProduction / totalProduction;
            const businessRatio = employeesProduction.businessProduction / totalProduction;
            // Reuse designInvestment of latest product
            const designInvestmentMultiplier = 1 + (Math.pow(item.designInvestment, 0.1)) / 100;
            const scienceMultiplier = 1 + (Math.pow(estimatedRP, industryData.scienceFactor!)) / 800;
            const balanceMultiplier =
                1.2 * engineerRatio
                + 0.9 * managementRatio
                + 1.3 * researchAndDevelopmentRatio
                + 1.5 * operationsRatio
                + businessRatio;
            const totalMultiplier = balanceMultiplier * designInvestmentMultiplier * scienceMultiplier;
            productStats.quality = totalMultiplier * (
                0.1 * employeesProduction.engineerProduction
                + 0.05 * employeesProduction.managementProduction
                + 0.05 * employeesProduction.researchAndDevelopmentProduction
                + 0.02 * employeesProduction.operationsProduction
                + 0.02 * employeesProduction.businessProduction
            );
            productStats.performance = totalMultiplier * (
                0.15 * employeesProduction.engineerProduction
                + 0.02 * employeesProduction.managementProduction
                + 0.02 * employeesProduction.researchAndDevelopmentProduction
                + 0.02 * employeesProduction.operationsProduction
                + 0.02 * employeesProduction.businessProduction
            );
            productStats.durability = totalMultiplier * (
                0.05 * employeesProduction.engineerProduction
                + 0.02 * employeesProduction.managementProduction
                + 0.08 * employeesProduction.researchAndDevelopmentProduction
                + 0.05 * employeesProduction.operationsProduction
                + 0.05 * employeesProduction.businessProduction
            );
            productStats.reliability = totalMultiplier * (
                0.02 * employeesProduction.engineerProduction
                + 0.08 * employeesProduction.managementProduction
                + 0.02 * employeesProduction.researchAndDevelopmentProduction
                + 0.05 * employeesProduction.operationsProduction
                + 0.08 * employeesProduction.businessProduction
            );
            productStats.aesthetics = totalMultiplier * (
                +0.08 * employeesProduction.managementProduction
                + 0.05 * employeesProduction.researchAndDevelopmentProduction
                + 0.02 * employeesProduction.operationsProduction
                + 0.1 * employeesProduction.businessProduction
            );
            productStats.features = totalMultiplier * (
                0.08 * employeesProduction.engineerProduction
                + 0.05 * employeesProduction.managementProduction
                + 0.02 * employeesProduction.researchAndDevelopmentProduction
                + 0.05 * employeesProduction.operationsProduction
                + 0.05 * employeesProduction.businessProduction
            );

            // Calculate product.rating
            let productRating = 0;
            const weights = industryData.product!.ratingWeights;
            for (const [statName, coefficient] of Object.entries(weights)) {
                productRating += productStats[statName] * coefficient;
            }

            // If we assume that input materials' average quality is high enough, we can use productRating
            // directly instead of having to calculate effectiveRating. Calculating effectiveRating is not important
            // here because we only want to know the relative difference between different office setups.
            productEffectiveRating = productRating;

            // Calculate product.markup
            // Reuse advertisingInvestment of latest product
            const advertisingInvestmentMultiplier = 1 + (Math.pow(item.advertisingInvestment, 0.1)) / 100;
            const businessManagementRatio = Math.max(
                businessRatio + managementRatio,
                1 / totalProduction
            );
            productMarkup = 100 / (
                advertisingInvestmentMultiplier * Math.pow(productStats.quality + 0.001, 0.65) * businessManagementRatio
            );

            // Calculate demand/competition
            demand = division.awareness === 0
                ? 20
                : Math.min(
                    100,
                    advertisingInvestmentMultiplier * (100 * (division.popularity / division.awareness))
                );
            // Hard-coded value of getRandomInt(0, 70). We don't want RNG here.
            competition = 35;
        } else {
            productEffectiveRating = item.effectiveRating;
            productMarkup = await getProductMarkup(
                division,
                industryData,
                CityName.Sector12,
                item,
                undefined
            );
            if (!item.demand || !item.competition) {
                throw new Error(`You need to unlock "Market Research - Demand" and "Market Data - Competition"`);
            }
            demand = item.demand;
            competition = item.competition;
        }

        itemMultiplier = 0.5 * Math.pow(productEffectiveRating, 0.65);
        markupLimit = Math.max(productEffectiveRating, 0.001) / productMarkup;
        // Reuse marketPrice of latest product. productionCost only depends on input materials' market
        // price and coefficient.
        marketPrice = item.productionCost;
    } else {
        if (!item.demand || !item.competition) {
            throw new Error(`You need to unlock "Market Research - Demand" and "Market Data - Competition"`);
        }
        demand = item.demand;
        competition = item.competition;
        itemMultiplier = item.quality + 0.001;
        markupLimit = item.quality / CorpMaterialsData[item.name].baseMarkup;
        marketPrice = item.marketPrice;
    }

    const marketFactor = getMarketFactor(demand, competition);
    const businessFactor = getBusinessFactor(employeesProduction.businessProduction);
    const advertisingFactor = getAdvertisingFactors(
        division.awareness,
        division.popularity,
        industryData.advertisingFactor!)[0];
    const maxSalesVolume =
        itemMultiplier *
        businessFactor *
        advertisingFactor *
        marketFactor *
        salesBotUpgradeBenefit *
        researchSalesMultiplier;

    let marginErrorRatio = 1;
    if (!itemIsProduct) {
        // Add margin error in case of output materials
        marginErrorRatio = 0.9;
    }
    if (maxSalesVolume < rawProduction * marginErrorRatio && business > 0) {
        log(ns, `WARNING: operations: ${operations}, engineer: ${engineer}, business: ${business}, management: ${management}`, true, 'info');
        log(ns, `WARNING: rawProduction: ${rawProduction}, maxSalesVolume: ${maxSalesVolume}`, true, 'info');
    }

    const optimalPrice = markupLimit / Math.sqrt(rawProduction / maxSalesVolume) + marketPrice;

    const profit = (rawProduction * 10) * optimalPrice;

    return {
        operations: operations,
        engineer: engineer,
        business: business,
        management: management,
        totalExperience: customData.office.totalExperience,
        rawProduction: rawProduction,
        maxSalesVolume: maxSalesVolume,
        optimalPrice: optimalPrice,
        productDevelopmentProgress: productDevelopmentProgress,
        estimatedRP: estimatedRP,
        productRating: productEffectiveRating,
        productMarkup: productMarkup,
        profit: profit,
    };
}

export function getEmployeeProductionByJobs(
    office: {
        avgIntelligence: number;
        avgCharisma: number;
        avgCreativity: number;
        avgEfficiency: number;
        avgMorale: number;
        avgEnergy: number;
        totalExperience: number;
        employeeJobs: {
            operations: number;
            engineer: number;
            business: number;
            management: number;
            researchAndDevelopment: number;
            intern: number;
            unassigned: number;
        };
    },
    corporationUpgradeLevels: CorporationUpgradeLevels,
    divisionResearches: DivisionResearches
): {
    managementProduction: number;
    operationsProduction: number;
    researchAndDevelopmentProduction: number;
    engineerProduction: number;
    businessProduction: number;
} {
    const upgradeAndResearchMultiplier = getUpgradeAndResearchMultiplierForEmployeeStats(
        corporationUpgradeLevels,
        divisionResearches
    );

    const effectiveIntelligence = office.avgIntelligence
        * upgradeAndResearchMultiplier.upgradeIntelligenceMultiplier * upgradeAndResearchMultiplier.researchIntelligenceMultiplier;
    const effectiveCharisma = office.avgCharisma
        * upgradeAndResearchMultiplier.upgradeCharismaMultiplier * upgradeAndResearchMultiplier.researchCharismaMultiplier;
    const effectiveCreativity = office.avgCreativity
        * upgradeAndResearchMultiplier.upgradeCreativityMultiplier * upgradeAndResearchMultiplier.researchCreativityMultiplier;
    const effectiveEfficiency = office.avgEfficiency
        * upgradeAndResearchMultiplier.upgradeEfficiencyMultiplier * upgradeAndResearchMultiplier.researchEfficiencyMultiplier;

    const productionBase = office.avgMorale * office.avgEnergy * 1e-4;

    const totalNumberOfEmployees = office.employeeJobs.operations
        + office.employeeJobs.engineer
        + office.employeeJobs.business
        + office.employeeJobs.management
        + office.employeeJobs.researchAndDevelopment
        + office.employeeJobs.intern
        + office.employeeJobs.unassigned;
    const exp = office.totalExperience / totalNumberOfEmployees;

    const operationsProduction = office.employeeJobs.operations * productionBase
        * (0.6 * effectiveIntelligence + 0.1 * effectiveCharisma + exp + 0.5 * effectiveCreativity + effectiveEfficiency);
    const engineerProduction = office.employeeJobs.engineer * productionBase
        * (effectiveIntelligence + 0.1 * effectiveCharisma + 1.5 * exp + effectiveEfficiency);
    const businessProduction = office.employeeJobs.business * productionBase
        * (0.4 * effectiveIntelligence + effectiveCharisma + 0.5 * exp);
    const managementProduction = office.employeeJobs.management * productionBase
        * (2 * effectiveCharisma + exp + 0.2 * effectiveCreativity + 0.7 * effectiveEfficiency);
    const researchAndDevelopmentProduction = office.employeeJobs.researchAndDevelopment * productionBase
        * (1.5 * effectiveIntelligence + 0.8 * exp + effectiveCreativity + 0.5 * effectiveEfficiency);

    return {
        operationsProduction: operationsProduction,
        engineerProduction: engineerProduction,
        businessProduction: businessProduction,
        managementProduction: managementProduction,
        researchAndDevelopmentProduction: researchAndDevelopmentProduction,
    };
}

function getUpgradeAndResearchMultiplierForEmployeeStats(
    corporationUpgradeLevels: CorporationUpgradeLevels,
    divisionResearches: DivisionResearches
): {
    researchCharismaMultiplier: number;
    upgradeIntelligenceMultiplier: number;
    upgradeCharismaMultiplier: number;
    researchCreativityMultiplier: number;
    researchEfficiencyMultiplier: number;
    upgradeCreativityMultiplier: number;
    researchIntelligenceMultiplier: number;
    upgradeEfficiencyMultiplier: number;
} {
    return {
        upgradeCreativityMultiplier: getUpgradeBenefit(
            UpgradeName.NUOPTIMAL_NOOTROPIC_INJECTOR_IMPLANTS,
            corporationUpgradeLevels[UpgradeName.NUOPTIMAL_NOOTROPIC_INJECTOR_IMPLANTS]
        ),
        upgradeCharismaMultiplier: getUpgradeBenefit(
            UpgradeName.SPEECH_PROCESSOR_IMPLANTS,
            corporationUpgradeLevels[UpgradeName.SPEECH_PROCESSOR_IMPLANTS]
        ),
        upgradeIntelligenceMultiplier: getUpgradeBenefit(
            UpgradeName.NEURAL_ACCELERATORS,
            corporationUpgradeLevels[UpgradeName.NEURAL_ACCELERATORS]
        ),
        upgradeEfficiencyMultiplier: getUpgradeBenefit(
            UpgradeName.FOCUS_WIRES,
            corporationUpgradeLevels[UpgradeName.FOCUS_WIRES]
        ),
        researchCreativityMultiplier: getResearchEmployeeCreativityMultiplier(divisionResearches),
        researchCharismaMultiplier: getResearchEmployeeCharismaMultiplier(divisionResearches),
        researchIntelligenceMultiplier: getResearchEmployeeIntelligenceMultiplier(divisionResearches),
        researchEfficiencyMultiplier: getResearchEmployeeEfficiencyMultiplier(divisionResearches),
    };
}

export function getResearchEmployeeCreativityMultiplier(divisionResearches: DivisionResearches): number {
    return getResearchMultiplier(divisionResearches, "employeeCreMult");
}

export function getResearchEmployeeCharismaMultiplier(divisionResearches: DivisionResearches): number {
    return getResearchMultiplier(divisionResearches, "employeeChaMult");
}

export function getResearchEmployeeIntelligenceMultiplier(divisionResearches: DivisionResearches): number {
    return getResearchMultiplier(divisionResearches, "employeeIntMult");
}

export function getResearchEmployeeEfficiencyMultiplier(divisionResearches: DivisionResearches): number {
    return getResearchMultiplier(divisionResearches, "productionMult");
}


export async function getProductMarkup(
    division: Division,
    industryData: CorpIndustryData,
    city: CityName,
    item: Product,
    office?: Office
): Promise<number> {
    let productMarkup;
    const productMarkupKey = `${division.name}|${city}|${item.name}`;
    productMarkup = productMarkupData.get(productMarkupKey);
    if (!productMarkup) {
        productMarkup = await calculateProductMarkup(
            division.researchPoints,
            industryData.scienceFactor!,
            item,
            (office) ? {
                operationsProduction: office.employeeProductionByJob.Operations,
                engineerProduction: office.employeeProductionByJob.Engineer,
                businessProduction: office.employeeProductionByJob.Business,
                managementProduction: office.employeeProductionByJob.Management,
                researchAndDevelopmentProduction: office.employeeProductionByJob["Research & Development"],
            } : undefined
        );
        productMarkupData.set(productMarkupKey, productMarkup);
    }
    return productMarkup;
}

export async function calculateProductMarkup(
    divisionRP: number,
    industryScienceFactor: number,
    product: Product,
    employeeProductionByJob?: {
        operationsProduction: number;
        engineerProduction: number;
        businessProduction: number;
        managementProduction: number;
        researchAndDevelopmentProduction: number;
    }
): Promise<number> {
    const designInvestmentMultiplier = 1 + Math.pow(product.designInvestment, 0.1) / 100;
    const researchPointMultiplier = 1 + Math.pow(divisionRP, industryScienceFactor) / 800;
    const k = designInvestmentMultiplier * researchPointMultiplier;
    const balanceMultiplier = function (
        creationJobFactorsEngineer: number,
        creationJobFactorsManagement: number,
        creationJobFactorsRnD: number,
        creationJobFactorsOperations: number,
        creationJobFactorsBusiness: number): number {
        const totalCreationJobFactors = creationJobFactorsEngineer + creationJobFactorsManagement + creationJobFactorsRnD + creationJobFactorsOperations + creationJobFactorsBusiness;
        const engineerRatio = creationJobFactorsEngineer / totalCreationJobFactors;
        const managementRatio = creationJobFactorsManagement / totalCreationJobFactors;
        const researchAndDevelopmentRatio = creationJobFactorsRnD / totalCreationJobFactors;
        const operationsRatio = creationJobFactorsOperations / totalCreationJobFactors;
        const businessRatio = creationJobFactorsBusiness / totalCreationJobFactors;
        return 1.2 * engineerRatio + 0.9 * managementRatio + 1.3 * researchAndDevelopmentRatio + 1.5 * operationsRatio + businessRatio;

    };
    const f1 = function ([creationJobFactorsEngineer, creationJobFactorsManagement, creationJobFactorsRnD, creationJobFactorsOperations, creationJobFactorsBusiness]: number[]) {
        return k
            * balanceMultiplier(creationJobFactorsEngineer, creationJobFactorsManagement, creationJobFactorsRnD, creationJobFactorsOperations, creationJobFactorsBusiness)
            * (0.1 * creationJobFactorsEngineer + 0.05 * creationJobFactorsManagement + 0.05 * creationJobFactorsRnD + 0.02 * creationJobFactorsOperations + 0.02 * creationJobFactorsBusiness)
            - product.stats.quality;
    };
    const f2 = function ([creationJobFactorsEngineer, creationJobFactorsManagement, creationJobFactorsRnD, creationJobFactorsOperations, creationJobFactorsBusiness]: number[]) {
        return k
            * balanceMultiplier(creationJobFactorsEngineer, creationJobFactorsManagement, creationJobFactorsRnD, creationJobFactorsOperations, creationJobFactorsBusiness)
            * (0.15 * creationJobFactorsEngineer + 0.02 * creationJobFactorsManagement + 0.02 * creationJobFactorsRnD + 0.02 * creationJobFactorsOperations + 0.02 * creationJobFactorsBusiness)
            - product.stats.performance;
    };
    const f3 = function ([creationJobFactorsEngineer, creationJobFactorsManagement, creationJobFactorsRnD, creationJobFactorsOperations, creationJobFactorsBusiness]: number[]) {
        return k
            * balanceMultiplier(creationJobFactorsEngineer, creationJobFactorsManagement, creationJobFactorsRnD, creationJobFactorsOperations, creationJobFactorsBusiness)
            * (0.05 * creationJobFactorsEngineer + 0.02 * creationJobFactorsManagement + 0.08 * creationJobFactorsRnD + 0.05 * creationJobFactorsOperations + 0.05 * creationJobFactorsBusiness)
            - product.stats.durability;
    };
    const f4 = function ([creationJobFactorsEngineer, creationJobFactorsManagement, creationJobFactorsRnD, creationJobFactorsOperations, creationJobFactorsBusiness]: number[]) {
        return k
            * balanceMultiplier(creationJobFactorsEngineer, creationJobFactorsManagement, creationJobFactorsRnD, creationJobFactorsOperations, creationJobFactorsBusiness)
            * (0.02 * creationJobFactorsEngineer + 0.08 * creationJobFactorsManagement + 0.02 * creationJobFactorsRnD + 0.05 * creationJobFactorsOperations + 0.08 * creationJobFactorsBusiness)
            - product.stats.reliability;
    };
    const f5 = function ([creationJobFactorsEngineer, creationJobFactorsManagement, creationJobFactorsRnD, creationJobFactorsOperations, creationJobFactorsBusiness]: number[]) {
        return k
            * balanceMultiplier(creationJobFactorsEngineer, creationJobFactorsManagement, creationJobFactorsRnD, creationJobFactorsOperations, creationJobFactorsBusiness)
            * (0.08 * creationJobFactorsManagement + 0.05 * creationJobFactorsRnD + 0.02 * creationJobFactorsOperations + 0.1 * creationJobFactorsBusiness)
            - product.stats.aesthetics;
    };
    let solverResult: CeresSolverResult = {
        success: false,
        message: "",
        x: [],
        report: "string",
    };
    const solver = new Ceres();
    await solver.promise.then(function () {
        solver.add_function(f1);
        solver.add_function(f2);
        solver.add_function(f3);
        solver.add_function(f4);
        solver.add_function(f5);
        // Guess the initial values of the solution
        let guess = [1, 1, 1, 1, 1];
        if (employeeProductionByJob) {
            guess = [
                employeeProductionByJob.engineerProduction,
                employeeProductionByJob.managementProduction,
                employeeProductionByJob.researchAndDevelopmentProduction,
                employeeProductionByJob.operationsProduction,
                employeeProductionByJob.businessProduction
            ];
        }
        solverResult = solver.solve(guess)!;
        solver.remove();
    });
    if (!solverResult.success) {
        throw new Error(`ERROR: Cannot find hidden stats of product: ${JSON.stringify(product)}`);
    }
    const totalCreationJobFactors = solverResult.x[0] + solverResult.x[1] + solverResult.x[2] + solverResult.x[3] + solverResult.x[4];
    const managementRatio = solverResult.x[1] / totalCreationJobFactors;
    const businessRatio = solverResult.x[4] / totalCreationJobFactors;

    const advertisingInvestmentMultiplier = 1 + Math.pow(product.advertisingInvestment, 0.1) / 100;
    const businessManagementRatio = Math.max(businessRatio + managementRatio, 1 / totalCreationJobFactors);
    return 100 / (advertisingInvestmentMultiplier * Math.pow(product.stats.quality + 0.001, 0.65) * businessManagementRatio);
}

export function getDivisionRawProduction(
    isProduct: boolean,
    employeesProduction: {
        operationsProduction: number;
        engineerProduction: number;
        managementProduction: number;
    },
    divisionProductionMultiplier: number,
    corporationUpgradeLevels: CorporationUpgradeLevels,
    divisionResearches: DivisionResearches
): number {
    const operationEmployeesProduction = employeesProduction.operationsProduction;
    const engineerEmployeesProduction = employeesProduction.engineerProduction;
    const managementEmployeesProduction = employeesProduction.managementProduction;
    const totalEmployeesProduction = operationEmployeesProduction + engineerEmployeesProduction + managementEmployeesProduction;
    if (totalEmployeesProduction <= 0) {
        return 0;
    }
    const managementFactor = 1 + managementEmployeesProduction / (1.2 * totalEmployeesProduction);
    const employeesProductionMultiplier = (Math.pow(operationEmployeesProduction, 0.4) + Math.pow(engineerEmployeesProduction, 0.3)) * managementFactor;
    const balancingMultiplier = 0.05;
    let officeMultiplier;
    if (isProduct) {
        officeMultiplier = 0.5 * balancingMultiplier * employeesProductionMultiplier;
    } else {
        officeMultiplier = balancingMultiplier * employeesProductionMultiplier;
    }

    // Multiplier from Smart Factories
    const upgradeMultiplier = 1 + corporationUpgradeLevels[UpgradeName.SMART_FACTORIES] * CorpUpgradesData[UpgradeName.SMART_FACTORIES].benefit;
    // Multiplier from researches
    let researchMultiplier = 1;
    researchMultiplier *=
        (divisionResearches[ResearchName.DRONES_ASSEMBLY] ? CorpResearchesData[ResearchName.DRONES_ASSEMBLY].productionMult : 1)
        * (divisionResearches[ResearchName.SELF_CORRECTING_ASSEMBLERS] ? CorpResearchesData[ResearchName.SELF_CORRECTING_ASSEMBLERS].productionMult : 1);
    if (isProduct) {
        researchMultiplier *= (divisionResearches[ResearchName.UPGRADE_FULCRUM] ? CorpResearchesData[ResearchName.UPGRADE_FULCRUM].productProductionMult : 1);
    }

    return officeMultiplier * divisionProductionMultiplier * upgradeMultiplier * researchMultiplier;
}

export async function buyUnlock(ns: NS, unlockName: CorpUnlockName): Promise<void> {
    if (ns.corporation.hasUnlock(unlockName)) {
        return;
    }
    while (ns.corporation.getUnlockCost(unlockName) > ns.corporation.getCorporation().funds*1.1) {
      await ns.sleep(1000);
    }
    ns.corporation.purchaseUnlock(unlockName);
}

export function hasDivision(ns: NS, divisionName: string): boolean {
    return ns.corporation.getCorporation().divisions.includes(divisionName);
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



export function upgradeOffices(ns: NS, divisionName: string, officeSetups: OfficeSetup[]): void {
    for (const officeSetup of officeSetups) {
        const office = ns.corporation.getOffice(divisionName, officeSetup.city);
        if (officeSetup.size < office.size) {
            ns.print(`Office's new size is smaller than current size. City: ${officeSetup.city}`);
            continue;
        }
        if (officeSetup.size > office.size) {
            // Upgrade office
            ns.corporation.upgradeOfficeSize(divisionName, officeSetup.city, officeSetup.size - office.size);
        }
        // Hire employees
        // eslint-disable-next-line no-empty
        while (ns.corporation.hireEmployee(divisionName, officeSetup.city, EmployeePosition.RESEARCH_DEVELOPMENT)) {
        }
    }
    // Assign jobs
    assignJobs(ns, divisionName, officeSetups);
    ns.print(`Upgrade offices completed`);
}

export function assignJobs(ns: NS, divisionName: string, officeSetups: OfficeSetup[]): void {
    for (const officeSetup of officeSetups) {
        // Reset all jobs
        for (const jobName of Object.values(EmployeePosition)) {
            ns.corporation.setJobAssignment(divisionName, officeSetup.city, jobName, 0);
        }
        // Assign jobs
        for (const [jobName, count] of Object.entries(officeSetup.jobs)) {
            if (!ns.corporation.setJobAssignment(divisionName, officeSetup.city, jobName, count)) {
                ns.print(`Cannot assign job properly. City: ${officeSetup.city}, job: ${jobName}, count: ${count}`);
            }
        }
    }
}


export function upgradeWarehouse(ns: NS, divisionName: string, city: CityName, targetLevel: number): void {
    const amount = targetLevel - ns.corporation.getWarehouse(divisionName, city).level;
    if (amount < 1) {
        return;
    }
    ns.corporation.upgradeWarehouse(divisionName, city, amount);
}

export function generateOfficeSetups(cities: CityName[], size: number, jobs: {
    name: EmployeePosition;
    count: number;
}[]): OfficeSetup[] {
    const officeSetupJobs: OfficeSetupJobs = {
        Operations: 0,
        Engineer: 0,
        Business: 0,
        Management: 0,
        "Research & Development": 0,
        Intern: 0,
    };
    for (const job of jobs) {
        switch (job.name) {
            case EmployeePosition.OPERATIONS:
                officeSetupJobs.Operations = job.count;
                break;
            case EmployeePosition.ENGINEER:
                officeSetupJobs.Engineer = job.count;
                break;
            case EmployeePosition.BUSINESS:
                officeSetupJobs.Business = job.count;
                break;
            case EmployeePosition.MANAGEMENT:
                officeSetupJobs.Management = job.count;
                break;
            case EmployeePosition.RESEARCH_DEVELOPMENT:
                officeSetupJobs["Research & Development"] = job.count;
                break;
            case EmployeePosition.INTERN:
                officeSetupJobs.Intern = job.count;
                break;
            default:
                throw new Error(`Invalid job: ${job.name}`);
        }
    }
    const officeSetups: OfficeSetup[] = [];
    for (const city of cities) {
        officeSetups.push({
            city: city,
            size: size,
            jobs: officeSetupJobs
        });
    }
    return officeSetups;
}

export function createDummyDivisions(ns: NS, numberOfDivisions: number): void {
    const divisions = ns.corporation.getCorporation().divisions;
    for (let i = 0; i < numberOfDivisions; i++) {
        const dummyDivisionName = dummyDivisionNamePrefix + i.toString().padStart(2, "0");
        if (divisions.includes(dummyDivisionName)) {
            continue;
        }
        ns.corporation.expandIndustry(IndustryType.RESTAURANT, dummyDivisionName);
        const division = ns.corporation.getDivision(dummyDivisionName);
        for (const city of cities) {
            if (!division.cities.includes(city)) {
                ns.corporation.expandCity(dummyDivisionName, city);
            }
            if (!ns.corporation.hasWarehouse(dummyDivisionName, city)) {
                ns.corporation.purchaseWarehouse(dummyDivisionName, city);
            }
        }
    }
}

export function buyAdvert(ns: NS, divisionName: string, targetLevel: number): void {
    for (let i = ns.corporation.getHireAdVertCount(divisionName); i < targetLevel; i++) {
        ns.corporation.hireAdVert(divisionName);
    }
    if (ns.corporation.getHireAdVertCount(divisionName) < targetLevel) {
       log(ns, `ERROR: Cannot buy enough Advert level`, true, 'error');
    }
}


export function getDivisionResearches(ns: NS, divisionName: string): DivisionResearches {
    const divisionResearches: DivisionResearches = {
        [ResearchName.HI_TECH_RND_LABORATORY]: false,
        [ResearchName.AUTO_BREW]: false,
        [ResearchName.AUTO_PARTY]: false,
        [ResearchName.AUTO_DRUG]: false,
        [ResearchName.CPH4_INJECT]: false,
        [ResearchName.DRONES]: false,
        [ResearchName.DRONES_ASSEMBLY]: false,
        [ResearchName.DRONES_TRANSPORT]: false,
        [ResearchName.GO_JUICE]: false,
        [ResearchName.HR_BUDDY_RECRUITMENT]: false,
        [ResearchName.HR_BUDDY_TRAINING]: false,
        [ResearchName.MARKET_TA_1]: false,
        [ResearchName.MARKET_TA_2]: false,
        [ResearchName.OVERCLOCK]: false,
        [ResearchName.SELF_CORRECTING_ASSEMBLERS]: false,
        [ResearchName.STIMU]: false,
        [ResearchName.UPGRADE_CAPACITY_1]: false,
        [ResearchName.UPGRADE_CAPACITY_2]: false,
        [ResearchName.UPGRADE_DASHBOARD]: false,
        [ResearchName.UPGRADE_FULCRUM]: false
    };
    for (const researchName of Object.values(ResearchName)) {
        divisionResearches[researchName] = ns.corporation.hasResearched(divisionName, researchName);
    }
    return divisionResearches;
}


export function getProfit(ns: NS) {
    const corporation = ns.corporation.getCorporation();
    return corporation.revenue - corporation.expenses;
}

export function buyUpgrade(ns: NS, upgrade: UpgradeName, targetLevel: number): void {
    for (let i = ns.corporation.getUpgradeLevel(upgrade); i < targetLevel; i++) {
        ns.corporation.levelUpgrade(upgrade);
    }
    if (ns.corporation.getUpgradeLevel(upgrade) < targetLevel) {
        ns.print(`ERROR: Cannot buy enough upgrade level`);
    }
}

export function getProductMarketPrice(
    ns: NS,
    division: Division,
    industryData: CorpIndustryData,
    city: CityName
): number {
    let productMarketPrice = 0;
    for (const [materialName, materialCoefficient] of getRecordEntries(industryData.requiredMaterials)) {
        const materialMarketPrice = ns.corporation.getMaterial(division.name, city, materialName).marketPrice;
        productMarketPrice += materialMarketPrice * materialCoefficient;
    }
    return productMarketPrice * productMarketPriceMultiplier;
}

export async function optimizeOffice(
    ns: NS,
    division: Division,
    industryData: CorpIndustryData,
    city: CityName,
    nonRnDEmployees: number,
    rndEmployee: number,
    item: Material | Product,
    useCurrentItemData: boolean,
    sortType: OfficeBenchmarkSortType,
    balancingModifierForProfitProgress: BalancingModifierForProfitProgress,
    maxRerun = 1,
    performanceModifier = defaultPerformanceModifierForOfficeBenchmark,
    enableLogging = false,
    employeeJobsRequirement?: EmployeeJobRequirement
): Promise<OfficeBenchmarkData[]> {
    if (useCurrentItemData && item.name === sampleProductName) {
        throw new Error("Do not use useCurrentItemData = true with sample product");
    }
    const data: OfficeBenchmarkData[] = [];
    const office = ns.corporation.getOffice(division.name, city);

    let avgMorale = office.avgMorale;
    let avgEnergy = office.avgEnergy;
    const corporationUpgradeLevels = getCorporationUpgradeLevels(ns);
    const divisionResearches = getDivisionResearches(ns, division.name);

    if (nonRnDEmployees < 4) {
        throw new Error(`Invalid employees' data. maxTotalEmployees: ${nonRnDEmployees}`);
    }

    const numberOfNewEmployees = nonRnDEmployees + rndEmployee - office.numEmployees;
    if (numberOfNewEmployees < 0) {
        throw new Error(`Invalid employees' data. maxTotalEmployees: ${nonRnDEmployees}, numberOfNewEmployees: ${numberOfNewEmployees}`);
    }
    const totalExperience = office.totalExperience + 75 * numberOfNewEmployees;

    let avgStats;
    try {
        avgStats = await calculateEmployeeStats(
            {
                avgMorale: office.avgMorale,
                avgEnergy: office.avgEnergy,
                totalExperience: office.totalExperience,
                numEmployees: office.numEmployees,
                employeeJobs: office.employeeJobs,
                employeeProductionByJob: office.employeeProductionByJob,
            },
            corporationUpgradeLevels,
            divisionResearches
        );
    } catch (e) {
        avgStats = {
            avgIntelligence: 75,
            avgCharisma: 75,
            avgCreativity: 75,
            avgEfficiency: 75,
        };
    }
    for (let i = 0; i < numberOfNewEmployees; i++) {
        avgMorale = divisionResearches[ResearchName.STIMU] ? 110 : 100;
        avgEnergy = divisionResearches[ResearchName.GO_JUICE] ? 110 : 100;
        avgStats.avgIntelligence = (avgStats.avgIntelligence * office.numEmployees + 75) / (office.numEmployees + 1);
        avgStats.avgCharisma = (avgStats.avgCharisma * office.numEmployees + 75) / (office.numEmployees + 1);
        avgStats.avgCreativity = (avgStats.avgCreativity * office.numEmployees + 75) / (office.numEmployees + 1);
        avgStats.avgEfficiency = (avgStats.avgEfficiency * office.numEmployees + 75) / (office.numEmployees + 1);
    }

    const customData: OfficeBenchmarkCustomData = {
        office: {
            avgMorale: avgMorale,
            avgEnergy: avgEnergy,
            avgIntelligence: avgStats.avgIntelligence,
            avgCharisma: avgStats.avgCharisma,
            avgCreativity: avgStats.avgCreativity,
            avgEfficiency: avgStats.avgEfficiency,
            totalExperience: totalExperience,
        },
        corporationUpgradeLevels: corporationUpgradeLevels,
        divisionResearches: divisionResearches,
        performanceModifier: performanceModifier
    };

    const printDataEntryLog = (dataEntry: OfficeBenchmarkData) => {
        let message = `{operations:${dataEntry.operations}, engineer:${dataEntry.engineer}, business:${dataEntry.business}, management:${dataEntry.management}, `;
        message += `totalExperience:${formatNumber(dataEntry.totalExperience)}, rawProduction:${formatNumber(dataEntry.rawProduction)}, `;
        message += `maxSalesVolume:${formatNumber(dataEntry.maxSalesVolume)}, optimalPrice:${formatNumber(dataEntry.optimalPrice)}, `;
        message += `profit:${dataEntry.profit.toExponential(5)}, salesEfficiency:${Math.min(dataEntry.maxSalesVolume / dataEntry.rawProduction, 1).toFixed(3)}`;
        if (isProduct(item)) {
            message += `, progress: ${dataEntry.productDevelopmentProgress.toFixed(5)}, progressCycle: ${Math.ceil(100 / dataEntry.productDevelopmentProgress)}`;
            message += `, estimatedRP: ${formatNumber(dataEntry.estimatedRP)}, rating: ${formatNumber(dataEntry.productRating)}`;
            message += `, markup: ${formatNumber(dataEntry.productMarkup)}, profit_progress: ${(dataEntry.profit * dataEntry.productDevelopmentProgress).toExponential(5)}}`;
        } else {
            message += "}";
        }
        log(ns, message, true, 'info');
    };

    const referenceData = await getReferenceData(ns,
        division,
        industryData,
        nonRnDEmployees,
        item,
        useCurrentItemData,
        customData
    );
    const comparatorCustomData: ComparatorCustomData = {
        referenceData: referenceData,
        balancingModifierForProfitProgress: balancingModifierForProfitProgress
    };

    let nonRnDEmployeesWithRequirement = nonRnDEmployees;
    if (employeeJobsRequirement) {
        nonRnDEmployeesWithRequirement = nonRnDEmployees - employeeJobsRequirement.engineer - employeeJobsRequirement.business;
    }
    const min = 1;
    const max = Math.floor(nonRnDEmployeesWithRequirement * 0.6);
    let maxUsedStep = 0;
    let error: unknown;

    // Create a single-threaded optimization function that directly calls the optimizer.
    const optimizer = new CorporationOptimizer();
    async function runOptimization(
        operationsRange: { min: number; max: number },
        engineerRange: { min: number; max: number },
        managementRange: { min: number; max: number }
    ): Promise<void> {
        try {
            const result = await optimizer.optimizeOffice(ns,
                division,
                industryData,
                operationsRange,
                engineerRange,
                managementRange,
                rndEmployee,
                nonRnDEmployees, // Do not use nonRnDEmployeesWithRequirement
                item,
                useCurrentItemData,
                customData,
                sortType,
                comparatorCustomData,
                enableLogging,
                employeeJobsRequirement
            );
            maxUsedStep = Math.max(maxUsedStep, result.step);
            data.push(...result.data);
        } catch (reason) {
            console.error(reason);
            error = reason;
        }
    }

    // Set up initial ranges.
    const operationsMin = min;
    const operationsMax = Math.floor(nonRnDEmployeesWithRequirement * 0.6);
    let engineerMin = min;
    let engineerMax = Math.floor(nonRnDEmployeesWithRequirement * 0.6);
    const managementMin = min;
    const managementMax = Math.floor(nonRnDEmployeesWithRequirement * 0.6);
    if (employeeJobsRequirement) {
        engineerMin = employeeJobsRequirement.engineer;
        engineerMax = employeeJobsRequirement.engineer;
    }

    // First run over the full range.
    await runOptimization(
        { min: operationsMin, max: operationsMax },
        { min: engineerMin, max: engineerMax },
        { min: managementMin, max: managementMax }
    );
    if (error) {
        throw new Error(`Error occurred in optimization: ${JSON.stringify(error)}`);
    }
    data.sort(getComparator(BenchmarkType.OFFICE, sortType, comparatorCustomData));

    // Rerun iterations to refine the result if necessary.
    let count = 0;
    while (true) {
        //logger.log(`maxUsedStep: ${maxUsedStep}`);
        if (count >= maxRerun) break;
        if (maxUsedStep === minStepForOfficeBenchmark) break;
        //logger.log("Rerun benchmark to get more accurate data");
        const currentBestResult = data[data.length - 1];
        //logger.log("Current best result:");
        printDataEntryLog(currentBestResult);
        let newEngineerMin = Math.max(currentBestResult.engineer - maxUsedStep, 1);
        let newEngineerMax = Math.min(currentBestResult.engineer + maxUsedStep, nonRnDEmployees - 3);
        if (employeeJobsRequirement) {
            newEngineerMin = employeeJobsRequirement.engineer;
            newEngineerMax = employeeJobsRequirement.engineer;
        }
        await runOptimization(
            {
                min: Math.max(currentBestResult.operations - maxUsedStep, 1),
                max: Math.min(currentBestResult.operations + maxUsedStep, nonRnDEmployees - 3)
            },
            {
                min: newEngineerMin,
                max: newEngineerMax,
            },
            {
                min: Math.max(currentBestResult.management - maxUsedStep, 1),
                max: Math.min(currentBestResult.management + maxUsedStep, nonRnDEmployees - 3),
            }
        );
        if (error) {
            throw new Error(`Error occurred in optimization: ${JSON.stringify(error)}`);
        }
        data.sort(getComparator(BenchmarkType.OFFICE, sortType, comparatorCustomData));
        ++count;
    }

    const dataForLogging = data.slice(-10);
    dataForLogging.forEach(printDataEntryLog);

    return data;
}



export function getCorporationUpgradeLevels(ns: NS): CorporationUpgradeLevels {
    const corporationUpgradeLevels: CorporationUpgradeLevels = {
        [UpgradeName.SMART_FACTORIES]: 0,
        [UpgradeName.SMART_STORAGE]: 0,
        //[UpgradeName.DREAM_SENSE]: 0,
        [UpgradeName.WILSON_ANALYTICS]: 0,
        [UpgradeName.NUOPTIMAL_NOOTROPIC_INJECTOR_IMPLANTS]: 0,
        [UpgradeName.SPEECH_PROCESSOR_IMPLANTS]: 0,
        [UpgradeName.NEURAL_ACCELERATORS]: 0,
        [UpgradeName.FOCUS_WIRES]: 0,
        [UpgradeName.ABC_SALES_BOTS]: 0,
        [UpgradeName.PROJECT_INSIGHT]: 0
    };
    for (const upgradeName of Object.values(UpgradeName)) {
        corporationUpgradeLevels[upgradeName] = ns.corporation.getUpgradeLevel(upgradeName);
    }
    return corporationUpgradeLevels;
}

export async function calculateEmployeeStats(
    office: {
        avgMorale: number;
        avgEnergy: number;
        totalExperience: number;
        numEmployees: number;
        employeeJobs: Record<EmployeePosition, number>;
        employeeProductionByJob: Record<EmployeePosition, number>;
    },
    corporationUpgradeLevels: CorporationUpgradeLevels,
    divisionResearches: DivisionResearches
): Promise<{
    avgCreativity: number;
    avgCharisma: number;
    avgIntelligence: number;
    avgEfficiency: number;
}> {
    // In 5 jobs [OPERATIONS, ENGINEER, BUSINESS, MANAGEMENT, RESEARCH_DEVELOPMENT], we need at least 4 jobs having 1
    // employee at the minimum
    let numberOfJobsHavingEmployees = 0;
    for (const [jobName, numberOfEmployees] of Object.entries(office.employeeJobs)) {
        if (jobName === "Intern" || jobName === "Unassigned" || numberOfEmployees === 0) {
            continue;
        }
        ++numberOfJobsHavingEmployees;
    }
    if (numberOfJobsHavingEmployees <= 3) {
        throw new Error("We need at least 4 jobs having 1 employee at the minimum");
    }

    const upgradeAndResearchMultiplier = getUpgradeAndResearchMultiplierForEmployeeStats(
        corporationUpgradeLevels,
        divisionResearches
    );

    const productionBase = office.avgMorale * office.avgEnergy * 1e-4;
    const exp = office.totalExperience / office.numEmployees;
    const f1 = function ([effectiveCreativity, effectiveCharisma, effectiveIntelligence, effectiveEfficiency]: number[]) {
        return office.employeeJobs[EmployeePosition.OPERATIONS] * productionBase
            * (0.6 * effectiveIntelligence + 0.1 * effectiveCharisma + exp + 0.5 * effectiveCreativity + effectiveEfficiency)
            - office.employeeProductionByJob[EmployeePosition.OPERATIONS];
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const f2 = function ([effectiveCreativity, effectiveCharisma, effectiveIntelligence, effectiveEfficiency]: number[]) {
        return office.employeeJobs[EmployeePosition.ENGINEER] * productionBase
            * (effectiveIntelligence + 0.1 * effectiveCharisma + 1.5 * exp + effectiveEfficiency)
            - office.employeeProductionByJob[EmployeePosition.ENGINEER];
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const f3 = function ([effectiveCreativity, effectiveCharisma, effectiveIntelligence, effectiveEfficiency]: number[]) {
        return office.employeeJobs[EmployeePosition.BUSINESS] * productionBase
            * (0.4 * effectiveIntelligence + effectiveCharisma + 0.5 * exp)
            - office.employeeProductionByJob[EmployeePosition.BUSINESS];
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const f4 = function ([effectiveCreativity, effectiveCharisma, effectiveIntelligence, effectiveEfficiency]: number[]) {
        return office.employeeJobs[EmployeePosition.MANAGEMENT] * productionBase
            * (2 * effectiveCharisma + exp + 0.2 * effectiveCreativity + 0.7 * effectiveEfficiency)
            - office.employeeProductionByJob[EmployeePosition.MANAGEMENT];
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const f5 = function ([effectiveCreativity, effectiveCharisma, effectiveIntelligence, effectiveEfficiency]: number[]) {
        return office.employeeJobs[EmployeePosition.RESEARCH_DEVELOPMENT] * productionBase
            * (1.5 * effectiveIntelligence + 0.8 * exp + effectiveCreativity + 0.5 * effectiveEfficiency)
            - office.employeeProductionByJob[EmployeePosition.RESEARCH_DEVELOPMENT];
    };
    let solverResult: CeresSolverResult = {
        success: false,
        message: "",
        x: [],
        report: "string",
    };
    const solver = new Ceres();
    await solver.promise.then(function () {
        solver.add_function(f1);
        solver.add_function(f2);
        solver.add_function(f3);
        solver.add_function(f4);
        solver.add_function(f5);
        const guess = [75, 75, 75, 75];
        solverResult = solver.solve(guess)!;
        solver.remove();
    });
    if (!solverResult.success) {
        console.error(solverResult);
        throw new Error(`ERROR: Cannot find hidden stats of employee. Office: ${JSON.stringify(office)}`);
    }
    return {
        avgCreativity: solverResult.x[0]
            / (upgradeAndResearchMultiplier.upgradeCreativityMultiplier * upgradeAndResearchMultiplier.researchCreativityMultiplier),
        avgCharisma: solverResult.x[1]
            / (upgradeAndResearchMultiplier.upgradeCharismaMultiplier * upgradeAndResearchMultiplier.researchCharismaMultiplier),
        avgIntelligence: solverResult.x[2]
            / (upgradeAndResearchMultiplier.upgradeIntelligenceMultiplier * upgradeAndResearchMultiplier.researchIntelligenceMultiplier),
        avgEfficiency: solverResult.x[3]
            / (upgradeAndResearchMultiplier.upgradeEfficiencyMultiplier * upgradeAndResearchMultiplier.researchEfficiencyMultiplier),
    };
}

export async function getReferenceData(ns:NS,
    division: Division,
    industryData: CorpIndustryData,
    nonRnDEmployees: number,
    item: Material | Product,
    useCurrentItemData: boolean,
    customData: OfficeBenchmarkCustomData
): Promise<OfficeBenchmarkData> {
    const operations = Math.floor(nonRnDEmployees * 0.031);
    const engineer = Math.floor(nonRnDEmployees * 0.489);
    const business = Math.floor(nonRnDEmployees * 0.067);
    const management = nonRnDEmployees - (operations + engineer + business);
    return await calculateOfficeBenchmarkData(ns,
        division,
        industryData,
        item,
        useCurrentItemData,
        customData,
        operations,
        engineer,
        business,
        management,
        0,
        getUpgradeBenefit(
            UpgradeName.ABC_SALES_BOTS,
            customData.corporationUpgradeLevels[UpgradeName.ABC_SALES_BOTS]
        ),
        getResearchSalesMultiplier(customData.divisionResearches),
        false
    );
}

export function developNewProduct(
    ns: NS,
    divisionName: string,
    mainProductDevelopmentCity: CityName,
    productDevelopmentBudget: number
): string | null {
    const products = ns.corporation.getDivision(divisionName).products;

    let hasDevelopingProduct = false;
    let bestProduct = null;
    let worstProduct = null;
    let maxProductRating = Number.MIN_VALUE;
    let minProductRating = Number.MAX_VALUE;
    for (const productName of products) {
        const product = ns.corporation.getProduct(divisionName, mainProductDevelopmentCity, productName);
        //Check if there is any developing product
        if (product.developmentProgress < 100) {
            hasDevelopingProduct = true;
            break;
        }
        // Determine the best and worst product
        const productRating = product.rating;
        if (productRating < minProductRating) {
            worstProduct = product;
            minProductRating = productRating;
        }
        if (productRating > maxProductRating) {
            bestProduct = product;
            maxProductRating = productRating;
        }
    }

    // Do nothing if there is any developing product
    if (hasDevelopingProduct) {
        return null;
    }
    if (!bestProduct && products.length > 0) {
        throw new Error("Cannot find the best product");
    }
    if (!worstProduct && products.length > 0) {
        throw new Error("Cannot find the worst product to discontinue");
    }
    // New product's budget should be greater than X% of current best product's budget.
    if (bestProduct) {
        const bestProductBudget = bestProduct.designInvestment + bestProduct.advertisingInvestment;
        if (productDevelopmentBudget < bestProductBudget * 0.5 && products.length >= 3) {
            const warningMessage = `Budget for new product is too low: ${ns.format.number(productDevelopmentBudget)}. `
                + `Current best product's budget: ${ns.format.number(bestProductBudget)}`;
            log(ns, warningMessage, true, 'info');
        }
    }

    if (worstProduct && products.length === getMaxNumberOfProducts(ns, divisionName)) {
        ns.corporation.discontinueProduct(divisionName, worstProduct.name);
    }
    const productName = generateNextProductName(ns, divisionName, productDevelopmentBudget);
    ns.corporation.makeProduct(
        divisionName,
        mainProductDevelopmentCity,
        productName,
        productDevelopmentBudget / 2,
        productDevelopmentBudget / 2,
    );
    return productName;
}

function getMaxNumberOfProducts(ns: NS, divisionName: string): number {
    let maxNumberOfProducts = 3;
    if (ns.corporation.hasResearched(divisionName, ResearchName.UPGRADE_CAPACITY_1)) {
        maxNumberOfProducts = 4;
    }
    if (ns.corporation.hasResearched(divisionName, ResearchName.UPGRADE_CAPACITY_2)) {
        maxNumberOfProducts = 5;
    }
    return maxNumberOfProducts;
}

export function generateNextProductName(ns: NS, divisionName: string, productDevelopmentBudget: number): string {
    if (!Number.isFinite(productDevelopmentBudget) || productDevelopmentBudget < 1e3) {
        throw new Error(`Invalid budget: ${productDevelopmentBudget}`);
    }
    const productIdArray = getProductIdArray(ns, divisionName);
    if (productIdArray.length === 0) {
        return `${divisionName}-00000-${productDevelopmentBudget.toExponential(5)}`;
    }
    return `${divisionName}-${(Math.max(...productIdArray) + 1).toString().padStart(5, "0")}-${productDevelopmentBudget.toExponential(5)}`;
}

export async function buyBoostMaterials(ns: NS, division: Division): Promise<void> {
    // This method is only called in round 3+. If we don't have more than 10e9 in funds, there must be something wrong
    // in the script.
    const funds = ns.corporation.getCorporation().funds/3;
    const industryData = ns.corporation.getIndustryData(division.industry);
    let reservedSpaceRatio = 0.2;
    const ratio = 0.1;
    if (industryData.makesProducts) {
        reservedSpaceRatio = 0.1;
    }
    let count = 0;
    while (true) {
        await waitForNextTimeStateHappens(ns, CorpState.EXPORT);
        if (count === 20) {
            const warningMessage = `It takes too many cycles to buy boost materials. Division: ${division.name}.`;
            //showWarning(ns, warningMessage);
            break;
        }
        let finish = true;
        const orders = [];
        for (const city of cities) {
            const warehouse = ns.corporation.getWarehouse(division.name, city);
            const availableSpace = warehouse.size - warehouse.sizeUsed;
            if (availableSpace < warehouse.size * reservedSpaceRatio) {
                continue;
            }
            let effectiveRatio = ratio;
            if ((availableSpace / warehouse.size < 0.5 && division.industry === IndustryType.AGRICULTURE)
                || (availableSpace / warehouse.size < 0.75
                    && (division.industry === IndustryType.CHEMICAL || division.industry === IndustryType.TOBACCO))) {
                effectiveRatio = 0.2;
            }
            const boostMaterialQuantities = getOptimalBoostMaterialQuantities(industryData, availableSpace * effectiveRatio);
            orders.push({
                city: city,
                materials: [
                    {
                        name: MaterialName.AI_CORES,
                        count: ns.corporation.getMaterial(division.name, city, MaterialName.AI_CORES).stored + boostMaterialQuantities[0]
                    },
                    {
                        name: MaterialName.HARDWARE,
                        count: ns.corporation.getMaterial(division.name, city, MaterialName.HARDWARE).stored + boostMaterialQuantities[1]
                    },
                    {
                        name: MaterialName.REAL_ESTATE,
                        count: ns.corporation.getMaterial(division.name, city, MaterialName.REAL_ESTATE).stored + boostMaterialQuantities[2]
                    },
                    {
                        name: MaterialName.ROBOTS,
                        count: ns.corporation.getMaterial(division.name, city, MaterialName.ROBOTS).stored + boostMaterialQuantities[3]
                    },
                ]
            });
            finish = false;
        }
        if (finish) {
            break;
        }
        await stockMaterials(
            ns,
            division.name,
            orders,
            true
        );
        ++count;
    }
}