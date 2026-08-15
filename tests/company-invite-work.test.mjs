import assert from "node:assert/strict";
import fs from "node:fs";
import { isCompanyApplicationResponse } from "../work-for-faction2.js";

assert.equal(isCompanyApplicationResponse("Software Engineering Intern"), true);
assert.equal(isCompanyApplicationResponse(null), true);
assert.equal(isCompanyApplicationResponse(true), true);
assert.equal(isCompanyApplicationResponse(false), true);
assert.equal(isCompanyApplicationResponse("ERROR:missing API"), false);
assert.equal(isCompanyApplicationResponse(undefined), false);

const source = fs.readFileSync(new URL("../work-for-faction2.js", import.meta.url), "utf8");
assert.doesNotMatch(source, /isTrue\(await singRun\(ns, "applyToCompany"/);
assert.match(source, /async function startCompanyWork[\s\S]*applyToCompany[\s\S]*workForCompany/);
assert.match(source, /currentWork\?\.type[\s\S]*currentWork\.type !== "COMPANY"[\s\S]*stopAction/);
assert.match(source,
  /if \(collectAllCompanyInvites && COMPANY_FACTIONS\.includes\(faction\)\) continue;/);
assert.match(source, /return collection\.completed \? "complete" : true;/);
assert.match(source,
  /const planResult = await planAndAct\(\);[\s\S]*planResult === "complete"[\s\S]*return;/);

console.log("corporate invitation work regression tests passed");
