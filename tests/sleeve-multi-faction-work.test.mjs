import assert from 'node:assert/strict'
import fs from 'node:fs'
import {planDistinctFactionRepRoutes} from '../faction-route-planner.js'
import {
  assignSleeveRepTargets,
  getFactionWorkOptions,
  getSleeveRepWorkerOrder,
} from '../sleeve.js'

const routeInput = {
  joinedFactions: ['Alpha', 'Beta', 'Gamma'],
  factionAugs: {
    Alpha: ['Shared', 'Alpha Aug'],
    Beta: ['Shared', 'Beta Aug'],
    Gamma: ['Gamma Aug'],
  },
  factionRep: {Alpha: 0, Beta: 0, Gamma: 0},
  factionRepRate: {Alpha: 1, Beta: 1, Gamma: 1},
  donationFactions: new Set(),
  gangFaction: null,
  gangAugs: new Set(),
  desiredAugSet: new Set(['Shared', 'Alpha Aug', 'Beta Aug', 'Gamma Aug']),
  augUtility: {'Shared': 10, 'Alpha Aug': 4, 'Beta Aug': 5, 'Gamma Aug': 3},
  augRepReqs: {'Shared': 100, 'Alpha Aug': 200, 'Beta Aug': 250, 'Gamma Aug': 150},
  augPrereqs: {},
  ownedAugs: [],
  priorityAugs: [],
}
const routes = planDistinctFactionRepRoutes(routeInput, 3, 'Beta')
assert.equal(routes.length, 3)
assert.equal(routes[0].faction, 'Beta')
assert.equal(new Set(routes.map(route => route.faction)).size, 3)
const alphaRoute = routes.find(route => route.faction === 'Alpha')
assert.ok(alphaRoute)
assert.ok(!alphaRoute.unlockedAugs.includes('Shared'),
  'later routes should not duplicate an augmentation already covered by a simulated earlier target')

const workTypes = {
  Alpha: ['hacking'],
  Beta: ['field', 'hacking'],
  Gamma: ['security'],
}
assert.deepEqual(getFactionWorkOptions('Beta', workTypes), ['field', 'hacking'])

const assignments = assignSleeveRepTargets(
  [0, 1, 2],
  {type: 'FACTION', factionName: 'Beta'},
  routes,
  workTypes,
)
assert.deepEqual(Object.values(assignments).map(assignment => assignment.faction), ['Beta', 'Gamma', 'Alpha'])
assert.equal(new Set(Object.values(assignments).map(assignment => assignment.faction)).size, 3)

const companyAssignments = assignSleeveRepTargets(
  [0, 4, 5],
  {type: 'COMPANY', companyName: 'ECorp'},
  routes,
  workTypes,
)
assert.deepEqual(companyAssignments[0], {type: 'COMPANY', companyName: 'ECorp'})
assert.equal(companyAssignments[4].type, 'FACTION')
assert.equal(companyAssignments[5].type, 'FACTION')

assert.deepEqual(assignSleeveRepTargets([0, 1], {}, routes, workTypes, true), {})

const sleeves = Array.from({length: 8}, (_, index) => ({sync: 100, shock: index === 0 ? 0 : 10}))
assert.deepEqual(getSleeveRepWorkerOrder(sleeves, {
  active: true,
  workSleeves: [0, 4, 5, 6, 7],
}, true), [0, 4, 5, 6, 7])

const source = fs.readFileSync(new URL('../sleeve.js', import.meta.url), 'utf8')
assert.doesNotMatch(source, /followPlayerSleeve/)
assert.match(source, /getFactionWorkTypes/)
assert.match(source, /planDistinctFactionRepRoutes/)
const assignmentIndex = source.indexOf("if (repAssignment?.type === 'FACTION')")
const trainingIndex = source.indexOf('if (canTrain)', assignmentIndex)
assert.ok(assignmentIndex >= 0 && trainingIndex > assignmentIndex,
  'productive faction assignments should run before optional sleeve training')

console.log('multi-faction sleeve work regression checks passed')
