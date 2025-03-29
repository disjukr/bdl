export default Diagram(
  Stack(
    Choice(0, "#", "@"),
    Sequence(NonTerminal("WS"), NonTerminal("Identifier"), NonTerminal("WS")),
    Optional(
      Choice(
        0,
        Sequence("-", ZeroOrMore(NonTerminal("not \\n"))),
        OneOrMore(
          Stack(
            NonTerminal("WS without Comment"),
            "|",
            ZeroOrMore(NonTerminal("not \\n"))
          )
        )
      )
    )
  )
);
