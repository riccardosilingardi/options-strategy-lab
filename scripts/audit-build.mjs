// ============================================================================
// scripts/audit-build.mjs — BUILD AGAINST ITS BOARDS (redesign PR 2's check; a thin caller since redesign PR 3).
//
//   node scripts/audit-build.mjs [light]
//
// Until PR 3 this compared Build with values typed from the PR 2 prompt. It now runs scripts/audit-screen.mjs on Build's
// five boards themselves (Build, BuildReview, BuildLoading, BuildNoData, BuildEmpty), read with mountMockup() in the
// same browser as the app. Exits as audit-screen does: 1 on any difference no rule explains.
// ============================================================================
import { spawnSync } from "node:child_process";

const theme = process.argv[2] === "light" ? "light" : "dark";
const r = spawnSync(process.execPath, ["scripts/audit-screen.mjs", "build", theme, ...process.argv.slice(3)], { stdio: "inherit" });
process.exit(r.status ?? 1);
