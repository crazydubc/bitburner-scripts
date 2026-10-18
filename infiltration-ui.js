// Scoped adaptation of the Sphyxis/Dihelvid approach. Uses undocumented React internals.
// Never dispatch synthetic keys: the game treats them as an automatic failure.
const gameTitles = new Set(['type it backward', 'type it', 'enter the code', 'close the brackets',
  'attack after the sentinel drops his guard and is distracted', 'say something nice about the guard',
  'remember all the mines', 'mark all the mines', 'match the symbols', 'cut the wires with the following properties']);
const text = element => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
const title = element => text(element).toLowerCase().split(/[!.(]/)[0].trim();

export function reactProps(element) {
  const key = Object.keys(element ?? {}).find(key => key.startsWith('__reactProps$'));
  return key ? element[key] : null;
}
function clickable(element) {
  return !!element && !element.disabled && element.getAttribute?.('aria-disabled') !== 'true' &&
    typeof reactProps(element)?.onClick === 'function';
}
export function clickInfiltrationElement(element) {
  if (!clickable(element)) throw new Error('Expected infiltration control is unavailable');
  const handler = reactProps(element).onClick;
  handler({isTrusted: true, target: element, currentTarget: element, preventDefault() {}, stopPropagation() {}});
}
export function infiltrationButton(scope, label, prefix = false) {
  return [...scope.querySelectorAll('button')].find(button => prefix ? text(button).startsWith(label) : text(button) === label);
}

/** Follow ancestors of a visible infiltration heading, never arbitrary application objects. */
export function infiltrationView(doc, company) {
  for (const heading of doc.querySelectorAll('h4, h5')) {
    const headingTitle = title(heading);
    const kind = text(heading) === `Infiltrating ${company}` ? 'intro' :
      headingTitle === 'infiltration successful' ? 'victory' : headingTitle === 'get ready' ? 'countdown' :
      gameTitles.has(headingTitle) ? 'game' : null;
    if (!kind) continue;
    const key = Object.keys(heading).find(key => key.startsWith('__reactFiber$'));
    let fiber = heading[key];
    for (let depth = 0; fiber && depth < 30; depth++, fiber = fiber.return) {
      const props = fiber.memoizedProps;
      const model = props?.state;
      if (model?.location?.name !== company || typeof model.onSuccess !== 'function' ||
        typeof model.onFailure !== 'function' || typeof model.cancel !== 'function' || !model.stage ||
        !Number.isInteger(model.level) || !Number.isInteger(model.maxLevel)) continue;
      return {kind, model, stage: props.stage,
        scope: heading.closest(kind === 'intro' ? '.MuiContainer-root' : '.MuiPaper-root')};
    }
  }
  return null;
}

export function infiltrationDemand(scope) {
  const line = [...scope.querySelectorAll('li')].map(text).find(value => value.startsWith('Market demand:'));
  const match = line?.match(/^Market demand:\s*([\d.]+)\s*%/);
  const value = match ? Number(match[1]) / 100 : NaN;
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

export function finishInfiltrationStage(view, handledStages) {
  if (view?.kind !== 'game' || view.stage !== view.model.stage || handledStages.has(view.stage)) return false;
  handledStages.add(view.stage);
  view.model.onSuccess(); // Preserve receiver; call once per displayed, currently active stage.
  return true;
}

export function selectInfiltrationFaction(scope, faction) {
  const combo = scope.querySelector('[role="combobox"]');
  if (!combo) throw new Error('Infiltration faction selector is unavailable');
  let fiber = combo[Object.keys(combo).find(key => key.startsWith('__reactFiber$'))];
  for (let depth = 0; fiber && depth < 20; depth++, fiber = fiber.return) {
    const props = fiber.memoizedProps;
    if (typeof props?.onChange !== 'function' || !Array.isArray(props.children)) continue;
    const options = props.children.flat(Infinity).filter(option => option?.props);
    const option = options.find(option => option.props.value === faction);
    if (!option) continue;
    if (props.value === faction) return true;
    props.onChange({target: {value: faction, name: props.name}}, option);
    return false; // Wait for React to render the updated closure before clicking Trade.
  }
  throw new Error(`Faction ${faction} is not offered by this infiltration`);
}

export function idleInfiltrationScreen(doc, companies = []) {
  if (doc.querySelector('[role="dialog"]')) return false;
  const cities = ['Aevum', 'Sector-12', 'Volhaven', 'Chongqing', 'New Tokyo', 'Ishima'];
  const cityPage = [...doc.querySelectorAll('p')].some(element => cities.includes(text(element))) &&
    ([...doc.querySelectorAll('span[aria-label]')].some(element => companies.includes(element.getAttribute('aria-label'))) ||
      [...doc.querySelectorAll('button')].some(element => companies.includes(text(element))));
  return !!doc.getElementById('terminal') || !!infiltrationButton(doc, 'Return to World') || cityPage;
}

function companyPageVisible(doc, company) {
  return [...doc.querySelectorAll('h4')].some(heading => {
    if (text(heading) === company) return true;
    // Backdoored company headings use CorruptibleText. Read the location identity
    // from this heading's React ancestors instead of matching its animated letters.
    let fiber = heading[Object.keys(heading).find(key => key.startsWith('__reactFiber$'))];
    for (let depth = 0; fiber && depth < 20; depth++, fiber = fiber.return) {
      const location = fiber.memoizedProps?.location;
      if (typeof location?.name === 'string') return location.name === company;
    }
    return false;
  });
}

export const infiltrationUiTimeout = 5000;
export async function openInfiltrationCompany(doc, company, sleep, canContinue = () => true) {
  const checkNavigation = () => {
    if (!canContinue()) throw new Error('Infiltration navigation cancelled');
    if (doc.querySelector('[role="dialog"]')) throw new Error('Infiltration navigation interrupted by a dialog');
  };
  const waitForControl = async (find, message) => {
    const deadline = Date.now() + infiltrationUiTimeout;
    while (true) {
      checkNavigation();
      const element = find();
      if (clickable(element)) return element;
      if (Date.now() >= deadline) throw new Error(`${message} (timed out after ${infiltrationUiTimeout / 1000}s)`);
      await sleep(50);
    }
  };
  checkNavigation();
  if (!companyPageVisible(doc, company)) {
    const city = [...doc.querySelectorAll('[role="button"]')].find(element => text(element).replace('🏙', '').trim() === 'City');
    if (!city) throw new Error('Open the City menu before running infiltration');
    clickInfiltrationElement(city);
    const location = await waitForControl(() =>
      [...doc.querySelectorAll('span[aria-label]')].find(element => element.getAttribute('aria-label') === company) ??
        infiltrationButton(doc, company), // Also support the game's non-ASCII city list.
      `Company ${company} is not visible in this city`);
    checkNavigation();
    clickInfiltrationElement(location);
  }
  const enter = await waitForControl(() => companyPageVisible(doc, company) && infiltrationButton(doc, 'Infiltrate Company'),
    `Company page or infiltration control did not become ready: ${company}`);
  checkNavigation();
  clickInfiltrationElement(enter);
}
