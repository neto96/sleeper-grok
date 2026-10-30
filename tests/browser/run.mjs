import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { startPreview } from "./server.mjs";

const output = resolve("test-results/browser");
const screenshots = "/workspace/screenshots/sleeper-private-browser";
await mkdir(output, { recursive: true });
await mkdir(screenshots, { recursive: true });
const server = await startPreview();
const address = server.httpServer.address();
const url = `http://127.0.0.1:${address.port}`;
const report = { checks: [], errors: [], screenshots: [] };
let browser;
const check = (name) => { report.checks.push(name); console.log(`PASS ${name}`); };
try {
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
  for (const [name, viewport] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, permissions: ["clipboard-read", "clipboard-write"], acceptDownloads: true });
    await context.route("**/*", async route => {
      if (new URL(route.request().url()).origin !== url) {
        report.errors.push(`Unexpected external request: ${route.request().url()}`);
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", error => report.errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") report.errors.push(message.text()); });
    page.setDefaultTimeout(15000);
    await page.goto(url);
    await page.getByRole("heading", { name: "Private Test League", exact: true }).waitFor();
    const headingSize = await page.getByRole("heading", { name: "Private Test League", exact: true }).evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    assert.ok(headingSize >= 30, `Application heading utilities missing: ${headingSize}px`);
    check(`${name}: real application styles loaded`);
    const tab = label => page.getByRole("button", { name: label, exact: true }).click();
    const markdown = async () => { await tab("Markdown"); return page.locator("pre").innerText(); };
    const baseline = await markdown();
    assert.ok(!baseline.includes("## Trade Analysis"));
    check(`${name}: baseline snapshot renders`);
    async function analyze(uneven = false) {
      await tab("Trade");
      await page.getByRole("button", { name: "Clear", exact: true }).click();
      await page.getByRole("checkbox", { name: /Alpha WR 5/ }).check();
      await page.getByRole("checkbox", { name: /Beta WR 5/ }).check();
      if (uneven) {
        await page.getByRole("checkbox", { name: /Beta WR 6/ }).check();
        await page.getByRole("checkbox", { name: /Beta RB 3/ }).check();
      }
      await page.getByRole("button", { name: "Analyze trade", exact: true }).click();
      await page.getByText("Phase 1 reuses structural and current-availability analysis.", { exact: false }).waitFor();
    }
    await analyze(true);
    const trade = await markdown();
    assert.ok(trade.startsWith(baseline));
    for (const text of ["## Trade Analysis", "Alpha sends to Beta", "Beta sends to Alpha", "Required drops: **2**", "future-readiness deltas"]) assert.ok(trade.includes(text), text);
    check(`${name}: uneven trade exports both teams and required drops`);
    await page.getByRole("button", { name: "Copy .md", exact: true }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), trade);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save .md", exact: true }).click();
    const download = await downloadPromise;
    assert.equal(await readFile(await download.path(), "utf8"), trade);
    check(`${name}: real clipboard and downloaded Markdown equal preview`);
    await tab("Trade");
    assert.equal(await page.getByRole("checkbox", { name: /Alpha WR 5/ }).isChecked(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    const screenshot = `${screenshots}/${name}.png`;
    await page.locator("[data-sonner-toast]").last().waitFor({ state: "hidden" });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" });
    report.screenshots.push(screenshot);
    check(`${name}: tab switching preserves trade; no horizontal overflow`);
    await page.getByRole("checkbox", { name: /Alpha WR 5/ }).uncheck();
    assert.equal(await markdown(), baseline);
    check(`${name}: editing selection clears export`);
    await analyze();
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    assert.equal(await markdown(), baseline);
    check(`${name}: Clear restores exact baseline`);
    await analyze();
    await page.getByRole("combobox", { name: "Trade partner" }).selectOption("30");
    assert.equal(await markdown(), baseline);
    check(`${name}: partner change clears export`);
    await tab("Trade");
    await page.getByRole("combobox", { name: "Trade partner" }).selectOption("20");
    await analyze();
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('button[type="submit"]')?.disabled);
    assert.equal(await markdown(), baseline);
    check(`${name}: new snapshot with same timestamp clears export`);
    await analyze();
    await page.getByRole("combobox", { name: "My team", exact: true }).selectOption("20");
    assert.ok(!(await markdown()).includes("## Trade Analysis"));
    check(`${name}: selected team change clears export`);
    await context.close();
  }
  // Separate clean session for a failed refresh. No real Sleeper request occurs.
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", error => report.errors.push(error.message));
  await page.goto(`${url}/?refresh-fails`);
  await page.getByRole("button", { name: "Trade", exact: true }).click();
  await page.getByRole("checkbox", { name: /Alpha WR 5/ }).check();
  await page.getByRole("checkbox", { name: /Beta WR 5/ }).check();
  await page.getByRole("button", { name: "Analyze trade", exact: true }).click();
  await page.getByText("Phase 1 reuses structural and current-availability analysis.", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.getByText("Simulated refresh failure", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Analyze trade", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  assert.ok(!(await page.locator("pre").innerText()).includes("## Trade Analysis"));
  check("failed refresh clears visible analysis and export");
  await context.close();
  assert.deepEqual(report.errors, [], "Browser errors or external requests");
} catch (error) {
  report.errors.push(error.stack || String(error));
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(`${report.checks.length} checks passed; ${report.errors.length} errors. Report: ${output}/report.json`);
  for (const error of report.errors) console.error(error);
}
