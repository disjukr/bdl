import type { BdlStandard } from "../generated/standard.ts";
import conventionalStandard, {
  yamlText as conventionalYaml,
} from "./standards/conventional.ts";
import globalStandard, { yamlText as globalYaml } from "./standards/global.ts";

const standards: Record<string, BdlStandard> = {
  conventional: conventionalStandard,
  global: globalStandard,
};
export default standards;

export const builtinStandardYamls: Record<string, string> = {
  conventional: conventionalYaml,
  global: globalYaml,
};
