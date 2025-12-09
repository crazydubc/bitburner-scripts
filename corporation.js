const EmployeePosition = {
    OPERATIONS : "Operations",
    ENGINEER : "Engineer",
    BUSINESS : "Business",
    MANAGEMENT : "Management",
    RESEARCH_DEVELOPMENT : "Research & Development",
    INTERN : "Intern",
    UNASSIGNED : "Unassigned"
}

const cities = ["Sector-12", "Aevum", "Volhaven", "Chongqing", "New Tokyo", "Ishima"];
const corpName = 'Shady Business';
const upgradeList = [
	// lower priority value -> upgrade faster
	{ prio: 2, name: "Project Insight", },
	{ prio: 2, name: "DreamSense" },
	{ prio: 4, name: "ABC SalesBots" },
	{ prio: 4, name: "Smart Factories" },
	{ prio: 4, name: "Smart Storage" },
	{ prio: 8, name: "Neural Accelerators" },
	{ prio: 8, name: "Nuoptimal Nootropic Injector Implants" },
	{ prio: 8, name: "FocusWires" },
	{ prio: 8, name: "Speech Processor Implants" },
	{ prio: 8, name: "Wilson Analytics" },
];

const researchList = [
    { prio: 10, name: "Overclock" },
    { prio: 10, name: "uPgrade: Fulcrum" },
    { prio: 3, name: "uPgrade: Capacity.I" },
    { prio: 11, name: "uPgrade: Dashboard" },
    { prio: 4, name: "uPgrade: Capacity.II" },
    { prio: 10, name: "Self-Correcting Assemblers" },
    { prio: 21, name: "Drones" },
    { prio: 4, name: "Drones - Assembly" },
    { prio: 10, name: "Drones - Transport" },
    { prio: 26, name: "Automatic Drug Administration" },
    { prio: 26, name: "CPH4 Injections" },
    { prio: 10, name: "AutoBrew" },
    { prio: 10, name: "AutoPartyManager" },
    { prio: 10, name: "HRBuddy-Recruitment" },
    { prio: 10, name: "HRBuddy-Training" },
    { prio: 15, name: "Go-Juice" },
    { prio: 15, name: "CPH4 Injections" },
    { prio: 15, name: "Sti.mu" },
];

const Industries = [
  "Tobacco", //20e9
  //"Spring Water", //10e9
  //"Restaurant", //10e9
  "Agriculture", //40e9
  "Software", //25e9
  "Refinery", //50e9
  "Chemical", //70e9
  "Fishing", //80e9
  "Water Utilities", //150e9
  "Pharmaceutical",//200e9
  "Mining", //300e9
  "Computer Hardware", //500e9
  "Healthcare", //750e9
  "Real Estate", //600e9
  "Robotics", //1e12
  ];

/** @param {NS} ns */
export async function main(ns) {

  if (!ns.corporation.canCreateCorporation()) return;
  await InitCorp(ns);

  while (true) {
    let corp = ns.corporation.getCorporation(); //RAM: 10 gig
    let allProducts = true;
    for (const divisionName of corp.divisions) {
      const division = ns.corporation.getDivision(divisionName);//RAM: 10 gig
      await upgradeWarehouse(ns, division);
      await upgradeCorp(ns);
      await manageMorale(ns, division);
      await hireEmployees(ns, division);
      const canMake = ns.corporation.getIndustryData(division.name).makesProducts;
      if (canMake && division.products < 3) {
        await newProduct(ns, division);
        allProducts = false;
      }
      sellItems(ns, division);
      if (division.products.length > 0) {
        upgradeDivision(ns, division);
      }
    }
    let divisons = corp.divisions.length;
    if (allProducts && divisons < Industries.length-1) {
      const newInd = Industries[divisons];
      const startCost = ns.corporation.getIndustryData(newInd).startingCost;
      if (corp.funds > startCost + 1.5e11) {
        ns.corporation.expandIndustry(newInd,newInd);
        await initCities(ns, corp, ns.corporation.getDivision(newInd));
      }
    }
    await ns.corporation.nextUpdate();//RAM: 1 gig
  }
}
/** @param {NS} ns, @param {Division} division, @param {string} item, @param {interger} priority */
function maybePreformResearch(ns, division, item, priority = 1.1) {
  if (!ns.corporation.hasResearched(division.name, item) &&
    division.researchPoints > ns.corporation.getResearchCost(division.name, item) * priority) {
      log(ns, `${division.name} researching ${item}`, true, 'info');
      ns.corporation.research(division.name, item);
      return true;
  }
  return false;
}
/** @param {NS} ns, @param {Division} division */
function upgradeDivision(ns, division) {
  const initResearchList = ["Hi-Tech R&D Laboratory", "Market-TA.I","Market-TA.II"];
  for (const item of initResearchList) {
    if (maybePreformResearch(ns, division, item, 1.0)) return;
  }

  for (const r of researchList) {
    if (maybePreformResearch(ns, division, r.name, r.prio)) return;
  }
}

function getPriceMultiplier(ns, totalSize, sizeUsed) {
  const ratio = sizeUsed/totalSize;
  if (ratio >= 0.9) return 1;
  if (ratio >= 0.75) return 2;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.25) return 4;
  return 5;
}

/** @param {NS} ns, @param {Division} division */
function sellItems(ns, division, productCity = "Sector-12") {
  for (const city of cities) {
    const wh = ns.corporation.getWarehouse(division.name, city);//RAM: 10 gig
    let priceMult = getPriceMultiplier(ns, wh.size, wh.sizeUsed);
    let price = priceMult == 1 ? "MP" : "MP*"+priceMult;
    for (const product of division.products) {
      ns.corporation.sellProduct(division.name, city, product, "MAX", price, false);
    }
  }
}

/** @param {NS} ns, @param {Division} division */
async function manageMorale(ns, division) {
  const funds = ns.corporation.getCorporation().funds;//RAM: 10 gig
  for (const city of cities) {
    const office = ns.corporation.getOffice(division.name, city);//RAM: 10 gig
    if (office.avgMorale < 70) {
      const amount = Math.min((100000*office.numEmployees),(funds/10));
      try {
        ns.corporation.throwParty(division.name, city, amount); //RAM: 20 gig
      } catch (error) {}
    } else if (office.avgEnergy < 70 && (funds/2 > 500000*office.numEmployees)) {
      ns.corporation.buyTea(division.name, city);//RAM: 20 gig
    }
  }
}

/** @param {NS} ns */
async function upgradeCorp(ns) {
  let funds = ns.corporation.getCorporation().funds;//RAM: 10 gig
  for (const upgrade of upgradeList) {
    let upgradeCost = ns.corporation.getUpgradeLevelCost(upgrade.name);//RAM: 10 gig
    if (funds > upgrade.prio * upgradeCost) {
      // For certain upgrades, only purchase if DreamSense is high enough.
      if (upgrade.name !== "ABC SalesBots" && upgrade.name !== "Wilson Analytics" || ns.corporation.getUpgradeLevel("DreamSense") > 20) {
        log(ns, `Upgrading ${upgrade.name} to level ${ns.corporation.getUpgradeLevel(upgrade.name) + 1}`, true, 'info');
        ns.corporation.levelUpgrade(upgrade.name);//RAM: 20 gig
      }
    }
  }
  //RAM: 10 gig each function
  if (!ns.corporation.hasUnlock("Shady Accounting") && ns.corporation.getUnlockCost("Shady Accounting") * 2 < funds) {
    log(ns, "Unlocking Shady Accounting", true, 'info');
    ns.corporation.purchaseUnlock("Shady Accounting");
  } else if (!ns.corporation.hasUnlock("Government Partnership") && ns.corporation.getUnlockCost("Government Partnership") * 2 < funds) {
    log(ns, "Unlocking Government Partnership", true, 'info');
    ns.corporation.purchaseUnlock("Government Partnership");
  }
}

/** @param {NS} ns, @param {Division} division */
async function upgradeWarehouse(ns, division) {
  for (const city of cities) {
    ns.corporation.setSmartSupply(division.name, city, true);//RAM: 20 gig
    const warehouse = ns.corporation.getWarehouse(division.name, city);//RAM: 10 gig
    if (warehouse.sizeUsed > 0.9 * warehouse.size) {
        const upgradeCost = ns.corporation.getUpgradeWarehouseCost(division.name, city);//RAM: 10 gig
        if (ns.corporation.getCorporation().funds > upgradeCost) {//RAM: 10 gig
            log(ns, `${division.name} upgrading warehouse in ${city}`, true, 'info');
            ns.corporation.upgradeWarehouse(division.name, city);//RAM: 20 gig
        }
    }
  }
  // Hire AdVert if Wilson Analytics is high enough.
  if (ns.corporation.getUpgradeLevel("Wilson Analytics") > 20) {//RAM: 10 gig
    const advertCost = ns.corporation.getHireAdVertCost(division.name);//RAM: 10 gig
    if (ns.corporation.getCorporation().funds > 4 * advertCost) {//RAM: 10 gig
      log(ns, `${division.name} hiring AdVert`, true, 'info');
      ns.corporation.hireAdVert(division.name);//RAM: 20 gig
    }
  }
}

/** @param {NS} ns, @param {Division} division */
async function newProduct(ns, division) {
    // Only start a new product if all current products are fully developed.
    for (const city of cities) {
      for (const prod of division.products) {
          const product = ns.corporation.getProduct(division.name, city, prod);//RAM: 10 gig
          if (product.developmentProgress < 100) {
              return false;
          }
      }
    }

    let newProductNumber = getLatestProductNumber(division) + 1;
    if (newProductNumber > 9) {
        newProductNumber = 0;
    }
    const newProductName = `Product-${newProductNumber}`;
    let productInvest = 1e9;
    const corpFunds = ns.corporation.getCorporation().funds;//RAM: 10 gig
    if (corpFunds < 2 * productInvest) {
        if (corpFunds <= 0) {
            log(ns, `WARN: negative funds, cannot start new product development: ${ns.nFormat(corpFunds, "0.0a")}`, true, 'info');
            return;
        } else {
            productInvest = Math.floor(corpFunds / 2);
        }
    }
    log(ns, `Starting new product development: ${newProductName}`, true, 'info');
    ns.corporation.makeProduct(division.name, "Sector-12", newProductName, productInvest, productInvest);//RAM: 20 gig
}
/** @param {Division} division */
function getLatestProductNumber(division) {
    const productNumbers = division.products.map(prod => {
        const match = prod.match(/\d+$/);
        return match ? parseInt(match[0]) : -1;
    });
    return Math.max(...productNumbers);
}

/** @param {NS} ns, @param {Corporation} corp, @param {Division} division, @param {string} productCity */
async function hireEmployees(ns, division, productCity = "Sector-12") {
  let office = ns.corporation.getOffice(division.name, productCity);
  while (ns.corporation.getCorporation().funds > (cities.length * ns.corporation.getOfficeSizeUpgradeCost(division.name, productCity, 3))) {
    log(ns, `${division.name} upgrading office sizes`, true, 'info');
    for (const city of cities) {
      ns.corporation.upgradeOfficeSize(division.name, city, 3);
      for (let i = 0; i < 3; i++) {
        ns.corporation.hireEmployee(division.name, city);
      }
    }
  }
    for (const city of cities) {
      let office = ns.corporation.getOffice(division.name, city);
      let employeesCount = office.numEmployees;
      let positionCounts = {}
      for (const job in EmployeePosition) {
        positionCounts[EmployeePosition[job]] = 0;
      }
      if (ns.corporation.hasResearched(division.name, "Market-TA.II")) {
        if (city === productCity) {
          positionCounts["Operations"] = Math.ceil(employeesCount / 5);
          positionCounts["Engineer"] = Math.ceil(employeesCount / 5);
          positionCounts["Business"] = Math.ceil(employeesCount / 5);
          positionCounts["Management"] = Math.ceil(employeesCount / 10);
          let remaining = employeesCount - (3 * Math.ceil(employeesCount / 5)) - Math.ceil(employeesCount / 10);
          positionCounts["Intern"] = remaining;
        } else {
          positionCounts["Operations"] = Math.floor(employeesCount / 10);
          positionCounts["Engineer"] = 1;
          positionCounts["Business"] = Math.floor(employeesCount / 5);
          positionCounts["Management"] = Math.ceil(employeesCount / 100);
          positionCounts["Research & Development"] = Math.ceil(employeesCount / 2);
          let remaining = employeesCount - (Math.floor(employeesCount / 5) + Math.floor(employeesCount / 10) + 1 + Math.ceil(employeesCount / 100) + Math.ceil(employeesCount / 2));
          positionCounts["Intern"] = remaining;
        }
      } else if (city === productCity) {
        positionCounts["Operations"] = Math.floor((employeesCount - 2) / 2);
        positionCounts["Engineer"] = Math.ceil((employeesCount - 2) / 2);
        positionCounts["Management"] = 2;
      } else {
        positionCounts["Operations"] = 1;
        positionCounts["Engineer"] = 1;
        positionCounts["Research & Development"] = employeesCount - 2;
      }
      for (const job in positionCounts) {
        try{
          //this can error is there is not enough free bodies. If so, the bodies will be freed up this cycle
          //and will be assigned next cycle. Maybe we can handle this better?
          ns.corporation.setAutoJobAssignment(division.name, city, job, positionCounts[job]);
        } catch (error) {
          log(ns, error + JSON.stringify(positionCounts) + ' ' + employeesCount, true, 'info');
          for (const j in positionCounts)
            ns.corporation.setAutoJobAssignment(division.name, city, j, 0);
        }
      }
    }
}


/** @param {NS} ns */
async function InitCorp(ns) {
  if (!ns.corporation.hasCorporation()) {
    log(ns, `Creating new company ${corpName}`, true, 'info');
    while (!ns.corporation.createCorporation(corpName)) {
      await ns.sleep(2000);
    }
  }
  const corp = ns.corporation.getCorporation();
  if (corp.divisions.length == 0) {
    log(ns, "Expanding industry to create division 'Tobacco'...", true, 'info');
    ns.corporation.expandIndustry("Tobacco","Tobacco");
    await initCities(ns, corp, ns.corporation.getDivision("Tobacco"));
    ns.corporation.purchaseUnlock("Smart Supply");
  }
  await ns.sleep(2000);
}


/** @param {NS} ns, @param {Corporation} corp, @param {Division} division, @param {string} productCity */
async function initCities(ns, corp, division, productCity = "Sector-12") {
    for (const city of cities) {
        log(ns, `Expanding ${division.name} to city ${city}`);
        if (!division.cities.includes(city)) {
          ns.corporation.expandCity(division.name, city);
          ns.corporation.purchaseWarehouse(division.name, city);
        }
        if (city !== productCity) {
            for (let i = 0; i < 3; i++) {
              ns.corporation.hireEmployee(division.name, city);
            }
            ns.corporation.setAutoJobAssignment(division.name, city, "Research & Development", 3);
        } else {
            const warehouseUpgrades = 3;
            for (let i = 0; i < warehouseUpgrades; i++) {
              ns.corporation.upgradeWarehouse(division.name, city);
            }
            const newEmployees = 9;
            ns.corporation.upgradeOfficeSize(division.name, productCity, newEmployees);
            for (let i = 0; i < newEmployees + 3; i++) {
              ns.corporation.hireEmployee(division.name, productCity);
            }
            ns.corporation.setAutoJobAssignment(division.name, productCity, "Operations", 4);
            ns.corporation.setAutoJobAssignment(division.name, productCity, "Engineer", 6);
            ns.corporation.setAutoJobAssignment(division.name, productCity, "Management", 2);
        }
        // Additional warehouse upgrades.
        for (let i = 0; i < 3; i++) {
            ns.corporation.upgradeWarehouse(division.name, city);
        }
    }
    //ns.corporation.makeProduct(division.name, productCity, "Product-0", 1e9, 1e9);
}