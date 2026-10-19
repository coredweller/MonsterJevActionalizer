/** Shared steps for the browser tests. */
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
import { STORAGE_KEY } from "@/app/useTrackers";

export const MAESTRO = fileURLToPath(new URL("../fixtures/monsters/MaestroDrazzuk.CR10.2014.json", import.meta.url));
export const BRIARTHORN = fileURLToPath(new URL("../fixtures/monsters/BriarthornHag.CR7.2024.json", import.meta.url));
export const TUNNEL_WASP = fileURLToPath(new URL("../fixtures/monsters/TunnelWasp.CR5.2014.json", import.meta.url));

export const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

/** Upload → fix screen → review screen → tracker, as a DM would. `review` runs on the review screen before Confirm. */
export async function loadMonster(page: Page, file: string, name: string, review?: (page: Page) => Promise<void>) {
  await page.goto("/");
  await page.getByLabel("Upload a statblock JSON").setInputFiles(file);
  await page.getByRole("button", { name: "Check monster" }).click();
  await page.getByRole("button", { name: "Continue to review" }).click();
  if (review) await review(page);
  await page.getByRole("button", { name: "Confirm and create tracker" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect.poll(() => stored(page, STORAGE_KEY)).toContain(name);
}
