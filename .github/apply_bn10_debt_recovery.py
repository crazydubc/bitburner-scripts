from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one anchor, found {count}")
    return text.replace(old, new, 1)


path = Path("corporation.js")
text = path.read_text()
text = replace_once(
    text,
    '''async function stabilizeRoundOneMaterialOrders(ns, liquidateBoosts = false) {
  const agriculture = await corpRun(ns, 'getDivision', div1)
  if (!agriculture || !Array.isArray(agriculture.cities)) return

  for (const city of agriculture.cities) {
    if (await corpRun(ns, 'hasWarehouse', div1, city) !== true) continue
    for (const material of BOOST_MATERIALS) {
      await corpRun(ns, 'buyMaterial', div1, city, material, 0)
      await corpRun(ns, 'sellMaterial', div1, city, material,
        liquidateBoosts ? "MAX" : 0, "MP")
    }
  }

  if (liquidateBoosts) {
    logBootstrapWarning(ns, `Round-one corporation funds are negative. Cancelling discretionary material buys ` +
      `and liquidating Agriculture boost materials until cash flow recovers.`)
  }
}
''',
    '''async function stabilizeRoundOneMaterialOrders(ns, liquidateBoosts = false) {
  const agriculture = await corpRun(ns, 'getDivision', div1)
  if (!agriculture || !Array.isArray(agriculture.cities)) return
  const industryData = await corpRun(ns, 'getIndustryData', agriculture.industry)
  const requiredMaterials = Object.keys(industryData?.requiredMaterials ?? {})

  for (const city of agriculture.cities) {
    if (await corpRun(ns, 'hasWarehouse', div1, city) !== true) continue

    // Required-input orders also persist. Cancel them immediately in debt, then let purchase() recreate
    // affordable rates after the cash floor has been restored.
    for (const material of requiredMaterials) {
      await corpRun(ns, 'buyMaterial', div1, city, material, 0)
      await corpRun(ns, 'sellMaterial', div1, city, material,
        liquidateBoosts ? "MAX" : 0, "MP")
    }

    for (const material of BOOST_MATERIALS) {
      await corpRun(ns, 'buyMaterial', div1, city, material, 0)
      await corpRun(ns, 'sellMaterial', div1, city, material,
        liquidateBoosts ? "MAX" : 0, "MP")
    }
  }

  if (liquidateBoosts) {
    logBootstrapWarning(ns, `Round-one corporation funds are negative. Cancelling all material buys ` +
      `and liquidating Agriculture inventory until cash flow recovers.`)
  }
}
''',
    "round-one debt recovery",
)
path.write_text(text)

bootstrap = Path("tests/corporation-bootstrap-capital.test.mjs")
text = bootstrap.read_text()
text = replace_once(
    text,
    "/liquidating Agriculture boost materials until cash flow recovers/",
    "/liquidating Agriculture inventory until cash flow recovers/",
    "bootstrap recovery assertion",
)
bootstrap.write_text(text)

cashflow = Path("tests/corporation-round1-cashflow.test.mjs")
text = cashflow.read_text()
text = replace_once(
    text,
    "assert.match(stabilize, /BOOST_MATERIALS/)\n",
    "assert.match(stabilize, /requiredMaterials/)\nassert.match(stabilize, /BOOST_MATERIALS/)\n",
    "required-input cancellation assertion",
)
cashflow.write_text(text)
