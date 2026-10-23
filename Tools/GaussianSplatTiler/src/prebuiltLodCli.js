#!/usr/bin/env node
import process from "node:process";
import {
  buildPrebuiltLodProduct,
  validatePrebuiltLodProduct,
} from "./prebuiltLodBuilder.js";

const usage =
  "Usage:\n  node prebuiltLodCli.js build --manifest levels.json --output scene\n  node prebuiltLodCli.js validate --input scene";
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "--help" || command === "-h" || !command) {
    console.log(usage);
    return;
  }
  const allowed =
    command === "build"
      ? ["--manifest", "--output"]
      : command === "validate"
        ? ["--input"]
        : [];
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (
      !allowed.includes(args[i]) ||
      !args[i + 1] ||
      args[i + 1].startsWith("--") ||
      Object.hasOwn(options, args[i])
    ) {
      throw new Error(
        "Invalid or repeated argument: " + args[i] + "\n" + usage,
      );
    }
    options[args[i]] = args[i + 1];
  }
  if (!allowed.length || allowed.some((name) => !options[name])) {
    throw new Error(usage);
  }
  if (command === "validate") {
    const result = await validatePrebuiltLodProduct(options["--input"]);
    console.log(
      JSON.stringify({
        valid: true,
        mciSha256: result.mciSha256,
        leafCount: result.leafCount,
        nodeCount: result.nodeCount,
      }),
    );
    return;
  }
  let last = 0;
  const result = await buildPrebuiltLodProduct(
    options["--manifest"],
    options["--output"],
    {
      onProgress(event) {
        if (Date.now() - last >= 2000 || event.stage === "validate") {
          console.error(JSON.stringify(event));
          last = Date.now();
        }
      },
    },
  );
  console.log(
    JSON.stringify({
      directory: result.directory,
      leafCount: result.report.leafCount,
      rootSplatCount: result.report.rootSplatCount,
      exceptions: result.report.exceptions.length,
      elapsedSeconds: result.report.elapsedSeconds,
    }),
  );
}
main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
});
