import type { BdlStandard } from "../../generated/standard.ts";
import standard from "../../generated/json/global.json" with {
  type: "json",
};
export default standard as unknown as BdlStandard;

import yamlText from "../../../../standards/global.yaml" with {
  type: "text",
};
export { yamlText };
