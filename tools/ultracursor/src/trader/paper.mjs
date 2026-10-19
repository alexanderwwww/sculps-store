#!/usr/bin/env node
/*
 * Old name, kept so nothing that calls it breaks: the "paper trader" is now
 * training, Sniper XYZ (sniper.mjs). This runs sniper.mjs with --train.
 */
import { pathToFileURL } from "node:url";
import { main } from "./sniper.mjs";

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) {
  const args = process.argv.slice(2);
  await main(args.includes("--train") ? args : ["--train", ...args]);
}
