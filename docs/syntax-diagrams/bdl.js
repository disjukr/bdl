import railroad from "https://raw.githubusercontent.com/tabatkins/railroad-diagrams/ea9a12393bbaa2c802b0449fd5bdf34b6868b83c/railroad.js";
Object.assign(globalThis, railroad);

export default Diagram(ZeroOrMore(NonTerminal("Top Level Statement")));
