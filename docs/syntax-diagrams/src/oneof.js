export default Diagram(
  Stack(
    Sequence(
      "oneof",
      NonTerminal("WS"),
      NonTerminal("Identifier"),
      NonTerminal("WS")
    ),
    Sequence(
      "{",
      ZeroOrMore(
        Choice(
          0,
          NonTerminal("WS"),
          NonTerminal("Attribute"),
          Sequence(
            NonTerminal("Type Expression"),
            NonTerminal("WS"),
            Optional(",")
          )
        )
      ),
      "}"
    )
  )
);
