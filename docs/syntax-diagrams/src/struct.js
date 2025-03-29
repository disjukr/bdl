export default Diagram(
  Stack(
    Sequence(
      "struct",
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
          NonTerminal("Struct Field")
        )
      ),
      "}"
    )
  )
);
