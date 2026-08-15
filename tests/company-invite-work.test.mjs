import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../work-for-faction2.js", import.meta.url), "utf8");
const helperSource = source.match(
  /function isApiError\(value\) \{[^\n]+\}\nexport function isCompanyApplicationSuccessful\(value\) \{[\s\S]*?\n\}/
)?.[0];
assert.ok(helperSource, "company application result helper should be exported");
const helperModule = await import(`data:text/javascript;base64,${Buffer.from(helperSource).toString("base64")}`);
const { isCompanyApplicationSuccessful } = helperModule;

assert.equal(isCompanyApplicationSuccessful("Software Engineering Intern"), true,
  "applyToCompany returns the accepted job name, not boolean true");
assert.equal(isCompanyApplicationSuccessful("Chief Technology Officer"), true);
assert.equal(isCompanyApplicationSuccessful(true), false,
  "the helper must model the real Singularity return contract");
assert.equal(isCompanyApplicationSuccessful(null), false);
assert.equal(isCompanyApplicationSuccessful(false), false);
assert.equal(isCompanyApplicationSuccessful(undefined), false);
assert.equal(isCompanyApplicationSuccessful("ERROR:applyToCompany failed"), false);

assert.doesNotMatch(source, /isTrue\(await singRun\(ns, "applyToCompany"/,
  "a successful job-name string must never be tested with an exact-true predicate");
assert.match(source, /async function applyForCompanyField\(company, field\)/,
  "company applications and no-promotion results should share one contract wrapper");
assert.match(source,
  /const missing = COMPANY_FACTIONS\.filter\(faction => !playerInfo\.factions\.includes\(faction\)\);/,
  "preparation must require actual faction membership, not merely a pending invite");
assert.match(source, /currentWork\?\.type && currentWork\.type !== "COMPANY"/,
  "corporate preparation should stop stale crime or faction work");

const corporateMode = source.match(/if \(collectAllCompanyInvites\) \{([\s\S]*?)\n    \}/)?.[1];
assert.ok(corporateMode, "corporate preparation branch should exist");
assert.match(corporateMode, /await collectCorporateInvites\(\);/);
assert.match(corporateMode, /return true;/,
  "corporate preparation must never fall through to generic crime fallback");
assert.doesNotMatch(corporateMode, /collection\.(handled|completed)/,
  "a transient company-work failure must not surrender player-action ownership");

console.log("corporate company-work regression tests passed");
