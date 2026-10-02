import { randomBytes } from "node:crypto";
import { readFileSync, watch } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const watching = process.argv.includes("--watch");
let building = false;
let pending = false;
let timer;

async function buildOnce() {
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const buildId = `${new Date().toISOString()}-${randomBytes(3).toString("hex")}`;
  const define = {
    __PLUGIN_VERSION__: JSON.stringify(version),
    __PLUGIN_BUILD_ID__: JSON.stringify(buildId),
  };

  // The UI build clears dist; build main last so both artifacts remain.
  await build({ configFile: join(root, "vite.config.ts"), define });
  await build({ configFile: join(root, "vite.config.main.ts"), define });
  console.log(`Plugin ${version} build ${buildId}`);
}

async function runBuilds() {
  if (building) {
    pending = true;
    return;
  }
  building = true;
  do {
    pending = false;
    try {
      await buildOnce();
    } catch (error) {
      console.error(error);
      if (!watching) process.exitCode = 1;
    }
  } while (pending);
  building = false;
}

if (watching) {
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void runBuilds(), 100);
  };
  watch(join(root, "src"), { recursive: true }, schedule);
  watch(root, (_event, filename) => {
    if (["package.json", "vite.config.ts", "vite.config.main.ts"].includes(filename)) schedule();
  });
}

await runBuilds();
