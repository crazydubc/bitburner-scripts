import { CorpState, UnlockName } from "./corpconsts";
import { buyOptimalAmountOfInputMaterials, buyTeaAndThrowPartyForAllDivisions, clearPurchaseOrders, getProductMarkup, loopAllDivisionsAndCities, setOptimalSellingPriceForEverything, setSmartSupplyData, validateProductMarkupMap, waitUntilAfterStateHappens } from "./corputils";

export async function main(ns: NS) {
  ns.disableLog("ALL");
  ns.clearLog();
  while (true) {
    if (ns.corporation.hasCorporation()) {
      let smartSupplyHasBeenEnabledEverywhere = false;
      const warehouseCongestionData = new Map<string, number>();
      if (ns.corporation.getCorporation().prevState == CorpState.PRODUCTION) {
        loopAllDivisionsAndCities(ns, (divisionName, city) => {
          const division = ns.corporation.getDivision(divisionName);
          if (!division.makesProducts) {
            clearPurchaseOrders(ns);
            return;
          }
          const industryData = ns.corporation.getIndustryData(division.industry);
          const office = ns.corporation.getOffice(divisionName, city);
          for (const productName of division.products) {
              const product = ns.corporation.getProduct(divisionName, city, productName);
              if (product.developmentProgress < 100) {
                  continue;
              }
              getProductMarkup(
                  division,
                  industryData,
                  city,
                  product,
                  office
              );
          }
        });
      }
      buyTeaAndThrowPartyForAllDivisions(ns);

      // Smart Supply
      if (!smartSupplyHasBeenEnabledEverywhere) {
          // Enable Smart Supply everywhere if we have unlocked this feature
          if (ns.corporation.hasUnlock(UnlockName.SMART_SUPPLY)) {
              loopAllDivisionsAndCities(ns, (divisionName, city) => {
                  ns.corporation.setSmartSupply(divisionName, city, true);
              });
              smartSupplyHasBeenEnabledEverywhere = true;
          }
          if (!smartSupplyHasBeenEnabledEverywhere) {
              setSmartSupplyData(ns);
              //clearPurchaseOrders(ns);
              buyOptimalAmountOfInputMaterials(ns, warehouseCongestionData);
          }
      }

      // Market TA2
      await setOptimalSellingPriceForEverything(ns);

      if (ns.corporation.getCorporation().prevState === CorpState.START) {
          //loopAllDivisionsAndCities(ns, (divisionName, city) => {
           //   const office = ns.corporation.getOffice(divisionName, city);
              // Check for Unassigned employees
          //});
          // Remove nonexistent product in productMarkupMap
          validateProductMarkupMap(ns);
      }
      await ns.corporation.nextUpdate();
    } else {
      await ns.sleep(5000);
    }
  }
}