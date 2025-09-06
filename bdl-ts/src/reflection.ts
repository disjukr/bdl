import { parse as parseYml } from "jsr:@std/yaml@1";
import { Hono } from "jsr:@hono/hono@4";
import { buildIrWithConfigObject } from "./io/ir.ts";
import type { BdlConfig } from "./generated/config.ts";
import type { BdlStandard } from "./generated/standard.ts";
import conventionalYmlText from "../../standards/conventional.yml" with {
  type: "text",
};

const conventionalYml = parseYml(conventionalYmlText) as BdlStandard;

export function createReflectionServer(
  config: BdlConfig,
  configDirectory: string,
): Hono {
  const app = new Hono();

  app.get("/bdl/standards", (c) => {
    return c.json(Array.from(listStandards(config)));
  });

  app.get("/bdl/standards/:standardId", async (c) => {
    const standardId = c.req.param("standardId");
    const standards = config.standards || {};
    if ((standardId === "conventional") && !("conventional" in standards)) {
      return c.json(conventionalYml);
    }
    if (!(standardId in standards)) return c.json({ type: "NotFound" }, 404);
    const standardYmlPath = standards[standardId];
    const standardYmlText = isUrl(standardYmlPath)
      ? await (await fetch(standardYmlPath)).text()
      : await Deno.readTextFile(standardYmlPath);
    const standardYml = parseYml(standardYmlText) as BdlStandard;
    return c.json(standardYml);
  });

  app.get("/bdl/standards/:standardId/ir", async (c) => {
    const standard = c.req.param("standardId");
    const standards = listStandards(config);
    if (!standards.has(standard)) return c.json({ type: "NotFound" }, 404);
    const { ir } = await buildIrWithConfigObject({
      configYml: config,
      configDirectory,
      standard,
      omitFileUrl: true,
    });
    return c.json(ir);
  });

  return app;
}

function listStandards(config: BdlConfig): Set<string> {
  const standards = new Set(["conventional"]);
  for (const key of Object.keys(config.standards || {})) standards.add(key);
  return standards;
}

function isUrl(path: string) {
  try {
    new URL(path);
    return true;
  } catch {
    return false;
  }
}
