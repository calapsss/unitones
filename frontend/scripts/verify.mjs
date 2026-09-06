import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const base = "http://127.0.0.1:3200";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const hq = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
});
const lower = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
});
const errors = [];
let original,
  unit,
  day,
  changed = false;
const output = new URL("../../.local/", import.meta.url);
await fs.mkdir(output, { recursive: true });
async function get(context, path) {
  const r = await context.request.get(base + "/api" + path);
  assert.equal(r.status(), 200, await r.text());
  return r.json();
}
async function post(context, path, data) {
  const r = await context.request.post(base + "/api" + path, { data });
  assert.equal(r.status(), 200, await r.text());
  return r.json();
}
const page = await hq.newPage(),
  editor = await lower.newPage();
for (const p of [page, editor])
  p.on("pageerror", (e) => errors.push(e.message));
const results = { checks: [], started_at: new Date().toISOString() };
try {
  await post(hq, "/session", { workspace: "AETC" });
  day = (await get(hq, "/provenance")).manifest.demo_day;
  const initial = await get(hq, `/dashboard?root=AETC&day=${day}`);
  unit =
    initial.units.find((u) => u.name === "PAFFS" && u.status === "Published")
      ?.id ||
    initial.units.find(
      (u) => u.status === "Published" && u.metrics.counts.passes > 0,
    ).id;
  await post(lower, "/session", { workspace: unit });
  original = await get(lower, `/units/${unit}/return?day=${day}`);
  const person = original.entries.find((e) => e.status === "passes");
  assert.ok(person);
  await page.goto(base);
  await page.getByRole("heading", { name: "Readiness for the day." }).waitFor();
  await page.screenshot({
    path: fileURLToPath(new URL("headquarters.png", output)),
    fullPage: true,
  });
  await editor.goto(base);
  await editor.getByRole("button", { name: "Update today’s return" }).click();
  await editor
    .getByRole("heading", { name: original.unit.name, exact: true })
    .waitFor();
  await editor.getByLabel("Search personnel").fill(person.name);
  await editor
    .getByLabel(`Status for ${person.name}`, { exact: true })
    .selectOption("available");
  await editor
    .getByLabel("Revision reason", { exact: true })
    .fill("E2E verification: confirm return from pass");
  await editor.getByRole("button", { name: "Save draft", exact: true }).click();
  await editor
    .getByRole("status")
    .filter({ hasText: "Draft revision" })
    .waitFor();
  changed = true;
  const draft = await get(hq, `/dashboard?root=AETC&day=${day}`);
  assert.equal(draft.metrics.available, initial.metrics.available);
  results.checks.push("UI draft saved; headquarters unchanged");
  await editor.getByRole("button", { name: "Review & publish" }).click();
  await editor
    .getByLabel("Publication reason")
    .fill("E2E verification: publish confirmed pass return");
  await editor
    .getByRole("button", { name: "Publish & recompute", exact: true })
    .click();
  await editor
    .getByRole("status")
    .filter({ hasText: "published. Headquarters totals recomputed" })
    .waitFor();
  const updated = await get(hq, `/dashboard?root=AETC&day=${day}`);
  assert.equal(updated.metrics.available, initial.metrics.available + 1);
  assert.equal(updated.metrics.unavailable, initial.metrics.unavailable - 1);
  await page.getByRole("button", { name: "Recompute", exact: true }).click();
  await page.waitForFunction(
    (n) =>
      document.querySelectorAll(".stat strong")[1]?.textContent ===
      Number(n).toLocaleString(),
    updated.metrics.available,
  );
  results.checks.push(
    "Unit UI publication increased headquarters availability by exactly one",
  );
  await editor.screenshot({
    path: fileURLToPath(new URL("unit-return.png", output)),
    fullPage: true,
  });
  const latest = await get(lower, `/units/${unit}/return?day=${day}`);
  assert.equal(latest.revision, original.revision + 2);
  const history = await get(lower, `/history/${original.history[0].id}`);
  assert.equal(
    history.entries.find((e) => e.id === person.id).status,
    "passes",
  );
  results.checks.push("Original revision preserved after correction");
  const stale = await lower.request.post(base + `/api/units/${unit}/return`, {
    data: {
      day,
      expected_revision: original.revision,
      publish: true,
      reason: "Stale verification",
      entries: original.entries,
    },
  });
  assert.equal(stale.status(), 409);
  results.checks.push("Stale browser edit rejected with 409");
  const denied = await lower.request.get(
    base + `/api/dashboard?root=ADC&day=${day}`,
  );
  assert.equal(denied.status(), 403);
  results.checks.push("Unit cannot read another command");
  const exported = await get(hq, `/export?root=AETC&day=${day}`);
  assert.equal(exported.metrics.available, updated.metrics.available);
  assert.ok(exported.source_returns.length);
  results.checks.push("Versioned export agrees with headquarters totals");
  for (const name of [
    "Unit returns",
    "Strength & establishment",
    "Revision history",
    "Calculation rules",
    "Sources & scope",
    "Daily picture",
  ]) {
    await page
      .locator("nav")
      .getByRole("button", { name: new RegExp("^" + name) })
      .click();
    await page.locator("main h1").waitFor();
    assert.equal(
      await page.locator(".error").count(),
      0,
      await page.locator(".error").allTextContents(),
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".toast").waitFor({ state: "hidden" });
  await page.screenshot({
    path: fileURLToPath(new URL("mobile.png", output)),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  assert.deepEqual(errors, []);
  results.checks.push(
    "All main views loaded without JavaScript errors; mobile has no page overflow",
  );
  results.before = {
    available: initial.metrics.available,
    unavailable: initial.metrics.unavailable,
  };
  results.after = {
    available: updated.metrics.available,
    unavailable: updated.metrics.unavailable,
  };
  results.unit = unit;
  results.day = day;
  results.result = "passed";
} finally {
  if (changed) {
    const latest = await get(lower, `/units/${unit}/return?day=${day}`);
    await post(lower, `/units/${unit}/return`, {
      day,
      expected_revision: latest.revision,
      publish: original.published,
      reason: "E2E verification complete: restore original demo state",
      establishment: original.establishment,
      entries: original.entries.map(({ id, status, note, rank, category }) => ({
        id,
        status,
        note,
        rank,
        category,
      })),
    });
    results.checks.push(
      "Demo state restored through an auditable new revision",
    );
  }
  await browser.close();
  await fs.writeFile(
    new URL("verification.json", output),
    JSON.stringify(results, null, 2),
  );
}
console.log(JSON.stringify(results, null, 2));
