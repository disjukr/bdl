export default Diagram(
  Stack(
    Sequence(
      "import",
      NonTerminal("WS"),
      AlternatingSequence(
        Sequence(NonTerminal("Identifier"), NonTerminal("WS")),
        Sequence(".", NonTerminal("WS"))
      )
    ),
    Stack(
      Terminal("{"),
      ZeroOrMore(
        Stack(
          Sequence(
            NonTerminal("WS"),
            NonTerminal("Identifier"),
            NonTerminal("WS")
          ),
          Optional(
            Sequence(
              "as",
              NonTerminal("WS"),
              NonTerminal("Identifier"),
              NonTerminal("WS")
            )
          ),
          Optional(",")
        )
      ),
      Sequence(NonTerminal("WS"), Terminal("}"))
    )
  )
);
