/** Renders the two result files written by repro.mjs as one comparison table. */
import { readFileSync } from "node:fs";

const dir = process.argv[2] ?? "/out";
const read = (mode) => JSON.parse(readFileSync(`${dir}/result-${mode}.json`, "utf8"));

const withFlag = read("with");
const withoutFlag = read("without");

const cell = (s) => {
  if (s === undefined) {
    return "n/a";
  }
  const status = s.ok ? "ok" : "FAIL";
  const detail = s.error === undefined ? "" : ` ${s.error}`;
  return `${status} (${s.ms} ms)${detail}`;
};

const launched = (result) => (result.rawLaunch.devToolsListening ? "ok" : "FAIL");
const sandbox = (result) => (result.sandboxErrors.length > 0 ? result.sandboxErrors.join(", ") : "none");

/** Column order is current behaviour first, then what this change produces. */
const rows = [
  { step: "sandbox errors on stderr", with: sandbox(withFlag), without: sandbox(withoutFlag) },
  { step: "chrome launched (direct spawn)", with: launched(withFlag), without: launched(withoutFlag) },
  ...withFlag.steps.map((s, index) => ({
    step: s.name,
    with: cell(s),
    without: cell(withoutFlag.steps.at(index)),
  })),
];

const headers = {
  step: "step",
  with: "with --single-process (added back)",
  without: "without --single-process (new default)",
};

const widths = {
  step: Math.max(headers.step.length, ...rows.map((r) => r.step.length)),
  with: Math.max(headers.with.length, ...rows.map((r) => r.with.length)),
  without: Math.max(headers.without.length, ...rows.map((r) => r.without.length)),
};
const line = (r) => `| ${r.step.padEnd(widths.step)} | ${r.with.padEnd(widths.with)} | ${r.without.padEnd(widths.without)} |`;

console.log(
  `\nchrome ${withFlag.chromeVersion}, protocolTimeout ${withFlag.protocolTimeoutMs} ms, navigation timeout ${withFlag.navigationTimeoutMs} ms\n`,
);
console.log(line(headers));
console.log(`|${[widths.step, widths.with, widths.without].map((w) => "-".repeat(w + 2)).join("|")}|`);
for (const r of rows) {
  console.log(line(r));
}
console.log("");
