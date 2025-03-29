export default Diagram(
  Stack(
    Sequence(
      "custom",
      NonTerminal("WS"),
      NonTerminal("Identifier"),
      NonTerminal("WS")
    ),
    Sequence("=", NonTerminal("WS"), NonTerminal("Type Expression"))
  )
);
