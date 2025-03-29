export default Diagram(
  Stack(
    Sequence("proc", NonTerminal("WS"), NonTerminal("Identifier")),
    Sequence(
      NonTerminal("WS"),
      "=",
      NonTerminal("WS"),
      NonTerminal("Type Expression")
    ),
    Sequence(
      NonTerminal("WS"),
      "->",
      NonTerminal("WS"),
      NonTerminal("Type Expression")
    ),
    Optional(
      Sequence(
        NonTerminal("WS"),
        "throws",
        NonTerminal("WS"),
        NonTerminal("Type Expression")
      )
    )
  )
);
