import type { BdlStandard } from "../../generated/standard.ts";
import standard from "../../generated/json/global.json" with {
  type: "json",
};
import yamlText from "../../generated/yaml/global.ts";
export default standard as unknown as BdlStandard;
export { yamlText };
