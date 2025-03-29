export default Diagram(
  Stack(
    Sequence(NonTerminal("Identifier"), NonTerminal("WS")),
    Optional(
      Sequence(
        "(",
        ZeroOrMore(
          Choice(
            0,
            NonTerminal("WS"),
            NonTerminal("Attribute"),
            NonTerminal("Struct Field")
          )
        ),
        ")"
      )
    ),
    Optional(",")
  )
);
