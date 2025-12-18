import { CeresSolverResult, CorpResearchesData, CorpState, CorpUpgradesData, CorporationUpgradeLevels, 
DivisionResearches, MaterialOrder, ResearchName, UnlockName, UpgradeName, boostMaterials, cities, 
EmployeePosition } from "./corpconsts";
import { Ceres } from "./ceres";
import { log } from "./helpers";

export type PartialRecord<K extends string, V> = Partial<Record<K, V>>;
export const getRecordKeys = Object.keys as <K extends string>(record: PartialRecord<K, any>) => K[];
export const getRecordEntries = Object.entries as <K extends string, V>(record: PartialRecord<K, V>) => [K, V][];
const smartSupplyData: Map<string, number> = new Map<string, number>();
const productMarkupData: Map<string, number> = new Map<string, number>();
const setOfDivisionsWaitingForRP: Set<string> = new Set<string>();
const costMultiplierForEmployeeStatsResearch = 5;
const costMultiplierForProductionResearch = 10;

export const dummyDivisionNamePrefix = "z-";
export interface ResearchPriority {
    research: ResearchName;
    costMultiplier: number;
}

export const researchPrioritiesForSupportDivision: ResearchPriority[] = [
    { research: ResearchName.HI_TECH_RND_LABORATORY, costMultiplier: 1 },
    { research: ResearchName.OVERCLOCK, costMultiplier: costMultiplierForEmployeeStatsResearch },
    { research: ResearchName.STIMU, costMultiplier: costMultiplierForEmployeeStatsResearch },
    { research: ResearchName.AUTO_DRUG, costMultiplier: 13.5 },
    { research: ResearchName.GO_JUICE, costMultiplier: costMultiplierForEmployeeStatsResearch },
    { research: ResearchName.CPH4_INJECT, costMultiplier: costMultiplierForEmployeeStatsResearch },

    { research: ResearchName.SELF_CORRECTING_ASSEMBLERS, costMultiplier: costMultiplierForProductionResearch },
    { research: ResearchName.DRONES, costMultiplier: 50 },
    { research: ResearchName.DRONES_ASSEMBLY, costMultiplier: costMultiplierForProductionResearch },
    { research: ResearchName.DRONES_TRANSPORT, costMultiplier: costMultiplierForProductionResearch },
];

export const researchPrioritiesForProductDivision: ResearchPriority[] = [
    ...researchPrioritiesForSupportDivision,
    { research: ResearchName.UPGRADE_FULCRUM, costMultiplier: costMultiplierForProductionResearch },
    // Do not buy these researches
    // {research: ResearchName.UPGRADE_CAPACITY_1, costMultiplier: costMultiplierForProductionResearch},
    // {research: ResearchName.UPGRADE_CAPACITY_2, costMultiplier: costMultiplierForProductionResearch},
];


export function parseNumber(input: number | string | null | undefined) {
    // Number(undefined) is NaN, so we don't have to handle that case
    if (input === null || input === "") {
        return NaN;
    }
    return Number(input);
}

export function isProduct(item: Material | Product): item is Product {
    return "rating" in item;
}

export function getBusinessFactor(businessProduction: number): number {
    return getEffectWithFactors(1 + businessProduction, 0.26, 10e3);
}

function getEffectWithFactors(n: number, expFac: number, linearFac: number): number {
    if (expFac <= 0 || expFac >= 1) {
        console.warn(`Exponential factor is ${expFac}. This is not an intended value for it`);
    }
    if (linearFac < 1) {
        console.warn(`Linear factor is ${linearFac}. This is not an intended value for it`);
    }
    return Math.pow(n, expFac) + n / linearFac;
}

export async function stockMaterials(
    ns: NS,
    divisionName: string,
    orders: MaterialOrder[],
    bulkPurchase = false,
    discardExceeded = false
): Promise<void> {
    let count = 0;
    while (true) {
        if (count === 5) {
            const warningMessage = `It takes too many cycles to stock up on materials. Division: ${divisionName}, `
                + `orders: ${JSON.stringify(orders)}`;
            //showWarning(ns, warningMessage);
            break;
        }
        let finish = true;
        for (const order of orders) {
            for (const material of order.materials) {
                const storedAmount = ns.corporation.getMaterial(divisionName, order.city, material.name).stored;
                if (storedAmount === material.count) {
                    ns.corporation.buyMaterial(divisionName, order.city, material.name, 0);
                    ns.corporation.sellMaterial(divisionName, order.city, material.name, "0", "MP");
                    continue;
                }
                // Buy
                if (storedAmount < material.count) {
                    if (bulkPurchase) {
                        ns.corporation.bulkPurchase(divisionName, order.city, material.name, material.count - storedAmount);
                    } else {
                        ns.corporation.buyMaterial(divisionName, order.city, material.name, (material.count - storedAmount) / 10);
                        ns.corporation.sellMaterial(divisionName, order.city, material.name, "0", "MP");
                    }
                    finish = false;
                }
                // Discard
                else if (discardExceeded) {
                    ns.corporation.buyMaterial(divisionName, order.city, material.name, 0);
                    ns.corporation.sellMaterial(divisionName, order.city, material.name, ((storedAmount - material.count) / 10).toString(), "0");
                    finish = false;
                }
            }
        }
        if (finish) {
            break;
        }
        await waitForNextTimeStateHappens(ns, CorpState.PURCHASE);
        ++count;
    }
}

export async function waitForNextTimeStateHappens(ns: NS, state: CorpState): Promise<void> {
    while (true) {
        await ns.corporation.nextUpdate();
        if (ns.corporation.getCorporation().prevState === state) {
            break;
        }
    }
}

export function setSmartSupplyData(ns: NS): void {
    // Only set smart supply data after "PURCHASE" state
    if (ns.corporation.getCorporation().prevState !== CorpState.PURCHASE) {
        return;
    }
    loopAllDivisionsAndCities(ns, (divisionName, city) => {
        const division = ns.corporation.getDivision(divisionName);
        const industrialData = ns.corporation.getIndustryData(division.type);
        const warehouse = ns.corporation.getWarehouse(division.name, city);
        let totalRawProduction = 0;

        if (industrialData.makesMaterials) {
            totalRawProduction += getLimitedRawProduction(
                ns,
                division,
                city,
                industrialData,
                warehouse,
                false
            );
        }

        if (industrialData.makesProducts) {
            for (const productName of division.products) {
                const product = ns.corporation.getProduct(divisionName, city, productName);
                if (product.developmentProgress < 100) {
                    continue;
                }
                totalRawProduction += getLimitedRawProduction(
                    ns,
                    division,
                    city,
                    industrialData,
                    warehouse,
                    true,
                    product.size
                );
            }
        }

        smartSupplyData.set(buildSmartSupplyKey(divisionName, city), totalRawProduction);
    });
}

export function getLimitedRawProduction(
    ns: NS,
    division: Division,
    city: CityName,
    industrialData: CorpIndustryData,
    warehouse: Warehouse,
    isProduct: boolean,
    productSize?: number
): number {
    let rawProduction = getRawProduction(ns, division, city, isProduct);

    // Calculate required storage space of each output unit. It is the net change in warehouse's storage space when
    // producing an output unit.
    let requiredStorageSpaceOfEachOutputUnit = 0;
    if (isProduct) {
        requiredStorageSpaceOfEachOutputUnit += productSize!;
    } else {
        for (const outputMaterialName of industrialData.producedMaterials!) {
            requiredStorageSpaceOfEachOutputUnit += ns.corporation.getMaterialData(outputMaterialName).size;
        }
    }
    for (const [requiredMaterialName, requiredMaterialCoefficient] of getRecordEntries(industrialData.requiredMaterials)) {
        requiredStorageSpaceOfEachOutputUnit -= ns.corporation.getMaterialData(requiredMaterialName).size * requiredMaterialCoefficient;
    }
    // Limit the raw production if needed
    if (requiredStorageSpaceOfEachOutputUnit > 0) {
        const maxNumberOfOutputUnits = Math.floor(
            (warehouse.size - warehouse.sizeUsed) / requiredStorageSpaceOfEachOutputUnit
        );
        rawProduction = Math.min(rawProduction, maxNumberOfOutputUnits);
    }

    rawProduction = Math.max(rawProduction, 0);
    return rawProduction;
}

export function getRawProduction(
    ns: NS,
    division: Division,
    city: CityName,
    isProduct: boolean
): number {
    const office = ns.corporation.getOffice(division.name, city);
    let rawProduction = getDivisionRawProduction(
        isProduct,
        {
            operationsProduction: office.employeeProductionByJob.Operations,
            engineerProduction: office.employeeProductionByJob.Engineer,
            managementProduction: office.employeeProductionByJob.Management
        },
        division.productionMult,
        getCorporationUpgradeLevels(ns),
        getDivisionResearches(ns, division.name)
    );
    rawProduction = rawProduction * 10;
    return rawProduction;
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

export function getCorporationUpgradeLevels(ns: NS): CorporationUpgradeLevels {
    const corporationUpgradeLevels: CorporationUpgradeLevels = {
        [UpgradeName.SMART_FACTORIES]: 0,
        [UpgradeName.SMART_STORAGE]: 0,
        [UpgradeName.DREAM_SENSE]: 0,
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

export function loopAllDivisionsAndCities(ns: NS, callback: (divisionName: string, city: CityName) => void): void {
    for (const division of ns.corporation.getCorporation().divisions) {
        if (division.startsWith(dummyDivisionNamePrefix)) {
            continue;
        }
        for (const city of cities) {
            callback(division, city);
        }
    }
}
function buildSmartSupplyKey(divisionName: string, city: CityName): string {
    return `${divisionName}|${city}`;
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

export function buyTeaAndThrowPartyForAllDivisions(ns: NS): void {
    // If we are in round 3+, we buy tea and throw party every cycle to maintain max energy/morale
    if (ns.corporation.getInvestmentOffer().round >= 3 || ns.corporation.getCorporation().public) {
        loopAllDivisionsAndCities(ns, (divisionName: string, city: CityName) => {
            ns.corporation.buyTea(divisionName, city);
            ns.corporation.throwParty(divisionName, city, 500000);
        });
        return;
    }
    const epsilon = 0.5;
    loopAllDivisionsAndCities(ns, (divisionName: string, city: CityName) => {
        const office = ns.corporation.getOffice(divisionName, city);
        if (office.avgEnergy < office.maxEnergy - epsilon) {
            ns.corporation.buyTea(divisionName, city);
        }
        if (office.avgMorale < office.maxMorale - epsilon) {
            ns.corporation.throwParty(divisionName, city, 500000);
        }
    });
}

export function clearPurchaseOrders(ns: NS, clearInputMaterialOrders: boolean = true): void {
    loopAllDivisionsAndCities(ns, (divisionName, city) => {
        for (const materialName of boostMaterials) {
            ns.corporation.buyMaterial(divisionName, city, materialName, 0);
            ns.corporation.sellMaterial(divisionName, city, materialName, "0", "MP");
        }
        if (clearInputMaterialOrders) {
            const division = ns.corporation.getDivision(divisionName);
            const industrialData = ns.corporation.getIndustryData(division.type);
            for (const materialName of getRecordKeys(industrialData.requiredMaterials)) {
                ns.corporation.buyMaterial(divisionName, city, materialName, 0);
                ns.corporation.sellMaterial(divisionName, city, materialName, "0", "MP");
            }
        }
    });
}

export function validateProductMarkupMap(ns: NS): void {
    for (const productKey of productMarkupData.keys()) {
        const productKeyInfo = productKey.split("|");
        const divisionName = productKeyInfo[0];
        const productName = productKeyInfo[2];
        if (!ns.corporation.getDivision(divisionName).products.includes(productName)) {
            productMarkupData.delete(productKey);
        }
    }
}

export async function setOptimalSellingPriceForEverything(ns: NS): Promise<void> {
    if (ns.corporation.getCorporation().nextState !== "SALE") {
        return;
    }
    if (!ns.corporation.hasUnlock(UnlockName.MARKET_RESEARCH_DEMAND)
        || !ns.corporation.hasUnlock(UnlockName.MARKET_DATA_COMPETITION)) {
        return;
    }
    await loopAllDivisionsAndCitiesAsyncCallback(ns, async (divisionName, city) => {
        const division = ns.corporation.getDivision(divisionName);
        const industryData = ns.corporation.getIndustryData(division.type);
        const products = division.products;
        const hasMarketTA2 = ns.corporation.hasResearched(divisionName, ResearchName.MARKET_TA_2);
        if (industryData.makesProducts) {
            // Set sell price for products
            for (const productName of products) {
                const product = ns.corporation.getProduct(divisionName, city, productName);
                if (product.developmentProgress < 100) {
                    continue;
                }
                if (hasMarketTA2) {
                    ns.corporation.setProductMarketTA2(divisionName, productName, true);
                    continue;
                }
                const optimalPrice = await getOptimalSellingPrice(ns, division, industryData, city, product);
                if (parseNumber(optimalPrice) > 0) {
                    ns.corporation.sellProduct(divisionName, city, productName, "MAX", optimalPrice, false);
                }
            }
        }
        if (industryData.makesMaterials) {
            // Set sell price for output materials
            for (const materialName of industryData.producedMaterials!) {
                const material = ns.corporation.getMaterial(divisionName, city, materialName);
                if (hasMarketTA2) {
                    ns.corporation.setMaterialMarketTA2(divisionName, city, materialName, true);
                    continue;
                }
                const optimalPrice = await getOptimalSellingPrice(ns, division, industryData, city, material);
                if (parseNumber(optimalPrice) > 0) {
                    ns.corporation.sellMaterial(divisionName, city, materialName, "MAX", optimalPrice);
                }
            }
        }
    });
}

export async function loopAllDivisionsAndCitiesAsyncCallback(
    ns: NS,
    callback: (divisionName: string, city: CityName) => Promise<void>
): Promise<void> {
    for (const division of ns.corporation.getCorporation().divisions) {
        if (division.startsWith(dummyDivisionNamePrefix)) {
            continue;
        }
        for (const city of cities) {
            await callback(division, city);
        }
    }
}

export async function getOptimalSellingPrice(
    ns: NS,
    division: Division,
    industryData: CorpIndustryData,
    city: CityName,
    item: Material | Product
): Promise<string> {
    const itemIsProduct = isProduct(item);
    if (itemIsProduct && item.developmentProgress < 100) {
        throw new Error(`Product is not finished. Product: ${JSON.stringify(item)}`);
    }
    if (!ns.corporation.hasUnlock(UnlockName.MARKET_RESEARCH_DEMAND)) {
        throw new Error(`You must unlock "Market Research - Demand"`);
    }
    if (!ns.corporation.hasUnlock(UnlockName.MARKET_DATA_COMPETITION)) {
        throw new Error(`You must unlock "Market Data - Competition"`);
    }

    if (ns.corporation.getCorporation().nextState !== "SALE") {
        return "0";
    }
    const expectedSalesVolume = item.stored / 10;
    // Do not compare with 0, there is case when item.stored is a tiny number.
    if (expectedSalesVolume < 1e-5) {
        return "0";
    }

    const office = ns.corporation.getOffice(division.name, city);
    let productMarkup: number;
    let markupLimit: number;
    let itemMultiplier: number;
    let marketPrice: number;
    if (itemIsProduct) {
        productMarkup = await getProductMarkup(
            division,
            industryData,
            city,
            item,
            office
        );
        markupLimit = Math.max(item.effectiveRating, 0.001) / productMarkup;
        itemMultiplier = 0.5 * Math.pow(item.effectiveRating, 0.65);
        marketPrice = item.productionCost;
    } else {
        markupLimit = item.quality / ns.corporation.getMaterialData(item.name).baseMarkup;
        itemMultiplier = item.quality + 0.001;
        marketPrice = item.marketPrice;
    }
    const businessFactor = getBusinessFactor(office.employeeProductionByJob[EmployeePosition.BUSINESS]);
    const advertisingFactor = getAdvertisingFactors(division.awareness, division.popularity, industryData.advertisingFactor!)[0];
    const marketFactor = getMarketFactor(item.demand!, item.competition!);
    const salesMultipliers =
        itemMultiplier *
        businessFactor *
        advertisingFactor *
        marketFactor *
        getUpgradeBenefit(UpgradeName.ABC_SALES_BOTS, ns.corporation.getUpgradeLevel(UpgradeName.ABC_SALES_BOTS)) *
        getResearchSalesMultiplier(getDivisionResearches(ns, division.name));
    const optimalPrice = markupLimit / Math.sqrt(expectedSalesVolume / salesMultipliers) + marketPrice;
    // ns.print(`item: ${item.name}, optimalPrice: ${ns.formatNumber(optimalPrice)}`);

    return optimalPrice.toString();
}

export function getMarketFactor(demand: number, competition: number): number {
    return Math.max(0.1, (demand * (100 - competition)) / 100);
}

export function getUpgradeBenefit(upgradeName: CorpUpgradeName, upgradeLevel: number): number {
    // For DreamSense, value is not a multiplier, so it starts at 0
    let value = (upgradeName === UpgradeName.DREAM_SENSE) ? 0 : 1;
    const benefit = CorpUpgradesData[upgradeName].benefit;
    if (!benefit) {
        throw new Error(`Cannot find data of upgrade: ${upgradeName}`);
    }
    value += benefit * upgradeLevel;
    return value;
}

export function getResearchSalesMultiplier(divisionResearches: DivisionResearches): number {
    return getResearchMultiplier(divisionResearches, "salesMult");
}

export function getResearchMultiplier(divisionResearches: DivisionResearches, researchDataKey: keyof typeof CorpResearchesData[string]): number {
    let multiplier = 1;
    for (const [researchName, researchData] of Object.entries(CorpResearchesData)) {
        if (!divisionResearches[<ResearchName>researchName]) {
            continue;
        }
        const researchDataValue = researchData[researchDataKey];
        if (!Number.isFinite(researchDataValue)) {
            throw new Error(`Invalid researchDataKey: ${researchDataKey}`);
        }
        multiplier *= researchDataValue as number;
    }
    return multiplier;
}

export function getAdvertisingFactors(awareness: number, popularity: number, industryAdvertisingFactor: number): [
    totalFactor: number,
    awarenessFactor: number,
    popularityFactor: number,
    ratioFactor: number,
] {
    const awarenessFactor = Math.pow(awareness + 1, industryAdvertisingFactor);
    const popularityFactor = Math.pow(popularity + 1, industryAdvertisingFactor);
    const ratioFactor = awareness === 0 ? 0.01 : Math.max((popularity + 0.001) / awareness, 0.01);
    const salesFactor = Math.pow(awarenessFactor * popularityFactor * ratioFactor, 0.85);
    return [salesFactor, awarenessFactor, popularityFactor, ratioFactor];
}

export function buyOptimalAmountOfInputMaterials(ns: NS, warehouseCongestionData: Map<string, number>): void {
    if (ns.corporation.getCorporation().nextState !== "PURCHASE") {
        return;
    }
    // Loop and set buy amount
    loopAllDivisionsAndCities(ns, (divisionName, city) => {
        const division = ns.corporation.getDivision(divisionName);
        const industrialData = ns.corporation.getIndustryData(division.type);
        const office = ns.corporation.getOffice(division.name, city);
        const requiredMaterials = getRecordEntries(industrialData.requiredMaterials);

        // Detect warehouse congestion
        let isWarehouseCongested = false;
        if (!setOfDivisionsWaitingForRP.has(divisionName)
            && office.employeeJobs["Research & Development"] !== office.numEmployees) {
            isWarehouseCongested = detectWarehouseCongestion(
                ns,
                division,
                industrialData,
                city,
                warehouseCongestionData
            );
        }
        if (isWarehouseCongested) {
          log(ns, `Warehouse full ${warehouseCongestionData}`, true, 'info');
          return;
        }

        const warehouse = ns.corporation.getWarehouse(division.name, city);
        const inputMaterials: PartialRecord<CorpMaterialName, {
            requiredQuantity: number,
            coefficient: number;
        }> = {};
        for (const [materialName, materialCoefficient] of requiredMaterials) {
            inputMaterials[materialName] = {
                requiredQuantity: 0,
                coefficient: materialCoefficient
            };
        }

        // Find required quantity of input materials to produce material/product
        for (const inputMaterialData of Object.values(inputMaterials)) {
            const requiredQuantity = (smartSupplyData.get(buildSmartSupplyKey(divisionName, city)) ?? 0)
                * inputMaterialData.coefficient;
            inputMaterialData.requiredQuantity += requiredQuantity;
        }

        // Limit the input material units to max number of units that we can store in warehouse's free space
        for (const [materialName, inputMaterialData] of getRecordEntries(inputMaterials)) {
            const materialData = ns.corporation.getMaterialData(materialName);
            const maxAcceptableQuantity = Math.floor((warehouse.size - warehouse.sizeUsed) / materialData.size);
            const limitedRequiredQuantity = Math.min(inputMaterialData.requiredQuantity, maxAcceptableQuantity);
            if (limitedRequiredQuantity > 0) {
                inputMaterialData.requiredQuantity = limitedRequiredQuantity;
            }
        }

        // Find which input material creates the least number of output units
        let leastAmountOfOutputUnits = Number.MAX_VALUE;
        for (const { requiredQuantity, coefficient } of Object.values(inputMaterials)) {
            const amountOfOutputUnits = requiredQuantity / coefficient;
            if (amountOfOutputUnits < leastAmountOfOutputUnits) {
                leastAmountOfOutputUnits = amountOfOutputUnits;
            }
        }

        // Align all the input materials to the smallest amount
        for (const inputMaterialData of Object.values(inputMaterials)) {
            inputMaterialData.requiredQuantity = leastAmountOfOutputUnits * inputMaterialData.coefficient;
        }

        // Calculate the total size of all input materials we are trying to buy
        let requiredSpace = 0;
        for (const [materialName, inputMaterialData] of getRecordEntries(inputMaterials)) {
            requiredSpace += inputMaterialData.requiredQuantity * ns.corporation.getMaterialData(materialName).size;
        }

        // If there is not enough free space, we apply a multiplier to required quantity to not overfill warehouse
        const freeSpace = warehouse.size - warehouse.sizeUsed;
        if (requiredSpace > freeSpace) {
            const constrainedStorageSpaceMultiplier = freeSpace / requiredSpace;
            for (const inputMaterialData of Object.values(inputMaterials)) {
                inputMaterialData.requiredQuantity = Math.floor(inputMaterialData.requiredQuantity * constrainedStorageSpaceMultiplier);
            }
        }

        // Deduct the number of stored input material units from the required quantity
        for (const [materialName, inputMaterialData] of getRecordEntries(inputMaterials)) {
            const material = ns.corporation.getMaterial(divisionName, city, materialName);
            inputMaterialData.requiredQuantity = Math.max(0, inputMaterialData.requiredQuantity - material.stored);
        }

        // Buy input materials
        for (const [materialName, inputMaterialData] of getRecordEntries(inputMaterials)) {
          if (inputMaterialData.requiredQuantity > 0) {
            //log(ns, `Purchasing ${materialName} x${inputMaterialData.requiredQuantity / 10} in ${city} for division ${divisionName}`, true, 'info');
            ns.corporation.buyMaterial(divisionName, city, materialName, inputMaterialData.requiredQuantity / 10);
          }
        }
    });
}

function detectWarehouseCongestion(
    ns: NS,
    division: Division,
    industrialData: CorpIndustryData,
    city: CityName,
    warehouseCongestionData: Map<string, number>
): boolean {
    const requiredMaterials = getRecordEntries(industrialData.requiredMaterials);
    let isWarehouseCongested = false;
    const warehouseCongestionDataKey = `${division.name}|${city}`;
    const items: (Material | Product)[] = [];
    if (industrialData.producedMaterials) {
        for (const materialName of industrialData.producedMaterials) {
            items.push(ns.corporation.getMaterial(division.name, city, materialName));
        }
    }
    if (industrialData.makesProducts) {
        for (const productName of division.products) {
            const product = ns.corporation.getProduct(division.name, city, productName);
            if (product.developmentProgress < 100) {
                continue;
            }
            items.push(product);
        }
    }
    for (const item of items) {
        if (item.productionAmount !== 0) {
            warehouseCongestionData.set(warehouseCongestionDataKey, 0);
            continue;
        }
        // item.productionAmount === 0 means that division does not produce material/product last cycle.
        let numberOfCongestionTimes = warehouseCongestionData.get(warehouseCongestionDataKey)! + 1;
        if (Number.isNaN(numberOfCongestionTimes)) {
            numberOfCongestionTimes = 0;
        }
        warehouseCongestionData.set(warehouseCongestionDataKey, numberOfCongestionTimes);
        break;
    }
    // If that happens more than 5 times, the warehouse is very likely congested.
    if (warehouseCongestionData.get(warehouseCongestionDataKey)! > 5) {
        isWarehouseCongested = true;
    }
    // We need to mitigate this situation. Discarding stored input material is the simplest solution.
    if (isWarehouseCongested) {
        //showWarning(ns, `Warehouse may be congested. Division: ${division.name}, city: ${city}.`);
        for (const [materialName] of requiredMaterials) {
            // Clear purchase
            ns.corporation.buyMaterial(division.name, city, materialName, 0);
            // Discard stored input material
            ns.corporation.sellMaterial(division.name, city, materialName, "MAX", "0");
        }
        warehouseCongestionData.set(warehouseCongestionDataKey, 0);
    } else {
        for (const [materialName] of requiredMaterials) {
            const material = ns.corporation.getMaterial(division.name, city, materialName);
            if (material.desiredSellAmount !== 0) {
                // Stop discarding input material
                ns.corporation.sellMaterial(division.name, city, materialName, "0", "0");
            }
        }
    }
    return isWarehouseCongested;
}


export async function waitUntilHavingEnoughResearchPoints(ns: NS, conditions: {
    divisionName: string;
    researchPoint: number;
}[]): Promise<void> {
    ns.print(`Waiting for research points: ${JSON.stringify(conditions)}`);
    while (true) {
        let finish = true;
        for (const condition of conditions) {
            if (ns.corporation.getDivision(condition.divisionName).researchPoints >= condition.researchPoint) {
                setOfDivisionsWaitingForRP.delete(condition.divisionName);
                continue;
            }
            setOfDivisionsWaitingForRP.add(condition.divisionName);
            finish = false;
        }
        if (finish) {
            break;
        }
        await ns.corporation.nextUpdate();
    }
    ns.print(`Finished waiting for research points. Conditions: ${JSON.stringify(conditions)}`);
}

export async function waitUntilAfterStateHappens(ns: NS, state: CorpState): Promise<void> {
    while (true) {
        if (ns.corporation.getCorporation().prevState === state) {
            break;
        }
        await ns.corporation.nextUpdate();
    }
}

export async function waitForNumberOfCycles(ns: NS, numberOfCycles: number): Promise<void> {
    const currentState = ns.corporation.getCorporation().prevState;
    let count = 0;
    while (count < numberOfCycles) {
        await waitForNextTimeStateHappens(ns, currentState as CorpState);
        ++count;
    }
}
export function getProductIdArray(ns: NS, divisionName: string): number[] {
    const products = ns.corporation.getDivision(divisionName).products;
    return products
        .map(productName => {
            const productNameParts = productName.split("-");
            if (productNameParts.length != 3) {
                return NaN;
            }
            return parseNumber(productNameParts[1]);
        })
        .filter(productIndex => !Number.isNaN(productIndex));
}