import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import {
  APP_ENV_REL_PATH,
  mergeAppEnv,
  parseAppEnv,
  projectRoot,
  readAppEnv,
} from "./with-app-env.mjs";

const execFileAsync = promisify(execFile);
const WRAPPER = join(projectRoot(), "scripts/with-app-env.mjs");
const PRINT_FLAG = "process.stdout.write(String(process.env.VITE_AUTH_ENABLED));";

function makeWorkspace(appEnvJson) {
  const root = mkdtempSync(join(tmpdir(), "app-env-"));
  if (appEnvJson !== undefined) {
    mkdirSync(join(root, ".grok"), { recursive: true });
    writeFileSync(join(root, APP_ENV_REL_PATH), appEnvJson);
  }
  return root;
}

test("keeps VITE_-prefixed string entries", () => {
  assert.deepEqual(parseAppEnv('{"VITE_AUTH_ENABLED":"false"}'), {
    VITE_AUTH_ENABLED: "false",
  });
});

test("drops non-VITE keys, non-string values and malformed documents", () => {
  assert.deepEqual(parseAppEnv('{"DATABASE_URL":"postgres://x","VITE_N":1,"VITE_OK":"y"}'), {
    VITE_OK: "y",
  });
  assert.deepEqual(parseAppEnv("not json"), {});
  assert.deepEqual(parseAppEnv('["VITE_AUTH_ENABLED"]'), {});
  assert.deepEqual(parseAppEnv("null"), {});
});

test("a missing app-env.json is a clean no-op", () => {
  assert.deepEqual(readAppEnv(makeWorkspace()), {});
});

test("reads the app env from a workspace", () => {
  const root = makeWorkspace('{"VITE_AUTH_ENABLED":"false"}');
  assert.deepEqual(readAppEnv(root), { VITE_AUTH_ENABLED: "false" });
});

test("an explicit process-env override wins over the file", () => {
  const merged = mergeAppEnv(
    { VITE_AUTH_ENABLED: "false" },
    { VITE_AUTH_ENABLED: "true", PATH: "/usr/bin" },
  );
  assert.equal(merged.VITE_AUTH_ENABLED, "true");
  assert.equal(merged.PATH, "/usr/bin");
});

test("the template ships auth off", () => {
  assert.deepEqual(readAppEnv(projectRoot()), { VITE_AUTH_ENABLED: "false" });
});

test("vite loadEnv resolves the wrapped value", () => {
  // What `import.meta.env.VITE_AUTH_ENABLED` becomes: loadEnv prefix-matches
  // process.env, so the wrapper's merge has to land before Vite starts.
  // Do not `import { loadEnv } from "vite"` here — Vite 8 loads rolldown
  // native bindings that SIGSEGV the test worker under qemu-user.
  const root = makeWorkspace('{"VITE_AUTH_ENABLED":"false"}');
  const merged = mergeAppEnv(readAppEnv(root), { PATH: "/usr/bin" });
  assert.equal(merged.VITE_AUTH_ENABLED, "false");
});

test("the wrapped command runs with the app env applied", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    WRAPPER,
    process.execPath,
    "-e",
    PRINT_FLAG,
  ]);
  assert.equal(stdout, "false");
});

test("the wrapped command sees an explicit override, not the file value", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    [WRAPPER, process.execPath, "-e", PRINT_FLAG],
    { env: { ...process.env, VITE_AUTH_ENABLED: "true" } },
  );
  assert.equal(stdout, "true");
});

test("the wrapper propagates the command's exit code", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [WRAPPER, process.execPath, "-e", "process.exit(3)"]),
    (err) => err.code === 3,
  );
});

test("a signal-killed command is never reported as success", async () => {
  // The wrapper's own SIGTERM handler must not swallow the re-raised signal:
  // a cancelled build reporting exit 0 is a silently passing gate.
  await assert.rejects(
    execFileAsync(process.execPath, [
      WRAPPER,
      process.execPath,
      "-e",
      "process.kill(process.pid, 'SIGTERM');setTimeout(() => {}, 1000);",
    ]),
    (err) => err.signal === "SIGTERM" || err.code !== 0,
  );
});

test("the CLI still runs when invoked through a symlinked path", async () => {
  // node realpaths import.meta.url but not process.argv[1], so a raw comparison
  // turns the wrapper into a no-op that exits 0 without starting anything.
  const link = join(mkdtempSync(join(tmpdir(), "app-env-link-")), "scripts");
  symlinkSync(join(projectRoot(), "scripts"), link);
  const { stdout } = await execFileAsync(process.execPath, [
    join(link, "with-app-env.mjs"),
    process.execPath,
    "-e",
    PRINT_FLAG,
  ]);
  assert.equal(stdout, "false");
});

// A fake local Node CLI represents the target behind npm's Windows .cmd shim.
// The resolver avoids executing that shim (and cmd.exe) altogether.
import { copyFileSync, rmSync } from "node:fs";
import { resolveCommand, exitStatusFromChild } from "./with-app-env.mjs";
import { constants as osConstants } from "node:os";

function fakeTool(t) {
  const root = mkdtempSync(join(tmpdir(), "app env tool "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "node_modules", "fake-package"), { recursive: true });
  mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ devDependencies: { "fake-package": "1" } }),
  );
  writeFileSync(
    join(root, "node_modules", "fake-package", "package.json"),
    JSON.stringify({ bin: { "fake-tool": "cli file.cjs" } }),
  );
  const entry = join(root, "node_modules", "fake-package", "cli file.cjs");
  writeFileSync(
    entry,
    "#!/usr/bin/env node\nconsole.log(JSON.stringify({args:process.argv.slice(2),flag:process.env.VITE_TEST,only:process.env.VITE_FILE_ONLY,hidden:process.env.PRIVATE_FILE_FLAG}));\n",
  );
  writeFileSync(join(root, "node_modules", ".bin", "fake-tool.cmd"), "@echo off\r\nexit /b 99\r\n");
  return { root, entry };
}

test("Windows resolves installed package bin rather than its cmd shim; arguments stay literal", async (t) => {
  const { root, entry } = fakeTool(t);
  const args = [
    "dev",
    "a path with spaces",
    '"quoted"',
    "& echo injected",
    "%PATH%",
    "!VAR!",
    "$(echo bad)",
    "trailing\\",
    "",
  ];
  const launch = resolveCommand("fake-tool", args, { platform: "win32", root });
  assert.equal(launch.command, process.execPath);
  assert.deepEqual(launch.args, [entry, ...args]);
  const { stdout } = await execFileAsync(launch.command, launch.args);
  assert.deepEqual(JSON.parse(stdout).args, args);
  assert.equal(args.length, 9);
});

test("POSIX resolution and explicit Windows executable paths remain unchanged", (t) => {
  const { root } = fakeTool(t),
    args = ["build", "path with spaces"];
  for (const platform of ["linux", "darwin"])
    assert.deepEqual(resolveCommand("fake-tool", args, { platform, root }), {
      command: "fake-tool",
      args,
    });
  for (const command of ["C:\\Program Files\\nodejs\\node.exe", "cmd.exe", "./local-tool"])
    assert.deepEqual(resolveCommand(command, args, { platform: "win32", root }), { command, args });
  assert.deepEqual(resolveCommand("missing-tool", args, { platform: "win32", root }), {
    command: "missing-tool",
    args,
  });
});

test("resolved CLI receives filtered file environment with process overrides", async (t) => {
  const { root } = fakeTool(t);
  mkdirSync(join(root, ".grok"));
  writeFileSync(
    join(root, APP_ENV_REL_PATH),
    JSON.stringify({ VITE_TEST: "file", VITE_FILE_ONLY: "kept", PRIVATE_FILE_FLAG: "discard" }),
  );
  const env = mergeAppEnv(readAppEnv(root), { ...process.env, VITE_TEST: "override" });
  delete env.PRIVATE_FILE_FLAG;
  const launch = resolveCommand("fake-tool", [], { platform: "win32", root });
  const { stdout } = await execFileAsync(launch.command, launch.args, { env });
  assert.deepEqual(JSON.parse(stdout), { args: [], flag: "override", only: "kept" });
});

test("Windows resolver supports string bins, skips non-Node bins, and rejects ambiguity", (t) => {
  const { root, entry } = fakeTool(t);
  const pkg = join(root, "node_modules", "fake-package", "package.json");
  writeFileSync(pkg, JSON.stringify({ bin: "cli file.cjs" }));
  assert.equal(resolveCommand("fake-package", [], { platform: "win32", root }).args[0], entry);
  writeFileSync(entry, "#!/bin/sh\nexit 0\n");
  assert.equal(
    resolveCommand("fake-package", [], { platform: "win32", root }).command,
    "fake-package",
  );
  writeFileSync(entry, "#!/usr/bin/env node\n");
  writeFileSync(pkg, JSON.stringify({ bin: { shared: "cli file.cjs" } }));
  mkdirSync(join(root, "node_modules", "second"));
  writeFileSync(
    join(root, "node_modules", "second", "package.json"),
    JSON.stringify({ bin: { shared: "../fake-package/cli file.cjs" } }),
  );
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ dependencies: { "fake-package": "1", second: "1" } }),
  );
  assert.throws(() => resolveCommand("shared", [], { platform: "win32", root }), /Ambiguous/);
});

test("wrapper missing command exits 127, missing arguments exit 2", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [WRAPPER, "nonexistent-app-env-tool-73928"]),
    (e) => e.code === 127 && e.stderr.includes("failed to run"),
  );
  await assert.rejects(execFileAsync(process.execPath, [WRAPPER]), (e) => e.code === 2);
});

test("exit helper preserves codes and signal failures", () => {
  assert.equal(exitStatusFromChild(0, null), 0);
  assert.equal(exitStatusFromChild(23, null), 23);
  assert.equal(exitStatusFromChild(null, null), 1);
  assert.equal(exitStatusFromChild(null, "SIGTERM"), 128 + osConstants.signals.SIGTERM);
  assert.equal(exitStatusFromChild(null, "UNKNOWN_SIGNAL"), 129);
});

test(
  "copied wrapper executes a local Node tool on Windows without a global installation",
  { skip: process.platform !== "win32" },
  async (t) => {
    const { root } = fakeTool(t);
    mkdirSync(join(root, "scripts"));
    copyFileSync(WRAPPER, join(root, "scripts", "with-app-env.mjs"));
    const { stdout } = await execFileAsync(process.execPath, [
      join(root, "scripts", "with-app-env.mjs"),
      "fake-tool",
      "space argument",
    ]);
    assert.deepEqual(JSON.parse(stdout).args, ["space argument"]);
  },
);
