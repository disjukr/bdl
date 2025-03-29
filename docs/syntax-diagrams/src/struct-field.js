export default Diagram(
  Stack(
    Sequence(
      NonTerminal("Identifier"),
      NonTerminal("WS"),
      Optional("?"),
      NonTerminal("WS")
    ),
    Sequence(
      ":",
      NonTerminal("WS"),
      NonTerminal("Type Expression"),
      Optional(",")
    )
  )
);
