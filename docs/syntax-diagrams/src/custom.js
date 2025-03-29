export default Diagram(
  Sequence(
    "custom",
    NonTerminal("WS"),
    NonTerminal("Identifier"),
    NonTerminal("WS"),
    "=",
    NonTerminal("WS"),
    NonTerminal("Type Expression")
  )
);
