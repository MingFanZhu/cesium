import process from "node:process";
import { URL } from "node:url";

const originEnvironmentVariable = "SCENEGIS_SANDCASTLE_ORIGIN";

function validateOrigin(origin) {
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(`${originEnvironmentVariable} must be a valid URL origin.`);
  }
  if (
    parsed.protocol !== "http:" ||
    parsed.hostname !== "localhost" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      `${originEnvironmentVariable} must be an http://localhost origin with an optional port.`,
    );
  }
  return parsed.origin;
}

async function loadUpstreamConfig() {
  return (await import("../../packages/sandcastle/vite.config.dev.ts")).default;
}

export async function createSceneGISViteConfig(
  configEnvironment,
  options = {},
) {
  const origin = validateOrigin(
    options.origin ?? process.env[originEnvironmentVariable],
  );
  const upstreamConfig = options.upstreamConfig ?? (await loadUpstreamConfig());
  const config =
    typeof upstreamConfig === "function"
      ? await upstreamConfig(configEnvironment)
      : upstreamConfig;
  return {
    ...config,
    define: {
      ...config.define,
      __OUTER_ORIGIN__: JSON.stringify(origin),
      __INNER_ORIGIN__: JSON.stringify(origin),
    },
  };
}

export default function sceneGISViteConfig(configEnvironment) {
  return createSceneGISViteConfig(configEnvironment);
}
