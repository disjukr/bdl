export default Diagram(
  Stack(
    Sequence(
      "union",
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
          NonTerminal("Union Item")
        )
      ),
      "}"
    )
  )
);
