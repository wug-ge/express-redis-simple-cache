#!/usr/bin/env node
import { execSync } from "node:child_process";

const bump = process.argv[2] || "patch";
const run = (cmd) => execSync(cmd, { stdio: "inherit" });

run("npm ci");                 // deterministic deps
run("npm run test");
run("npm run build");

run(`npm version ${bump} -m "chore(release): %s"`); // bumps, creates tag
run("npm publish --access public");                 // needs NPM auth set up once
run("git push && git push --follow-tags");
