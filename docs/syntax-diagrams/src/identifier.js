export default Diagram(
  Choice(0, "_", NonTerminal("a to z"), NonTerminal("A to Z")),
  ZeroOrMore(
    Choice(
      0,
      "_",
      NonTerminal("a to z"),
      NonTerminal("A to Z"),
      NonTerminal("0 to 9")
    )
  )
);
