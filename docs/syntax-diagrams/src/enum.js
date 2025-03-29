export default Diagram(
  Stack(
    Sequence(
      "enum",
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
          Sequence(NonTerminal("Identifier"), NonTerminal("WS"), Optional(","))
        )
      ),
      "}"
    )
  )
);
