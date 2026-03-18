import type { BdlStandard } from "../../generated/standard.ts";
import standard from "../../generated/json/conventional.json" with {
  type: "json",
};
import yamlText from "../../generated/yaml/conventional.ts";
export default standard as unknown as BdlStandard;
export { yamlText };
