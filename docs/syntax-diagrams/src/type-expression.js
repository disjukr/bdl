export default Diagram(
  Sequence(
    NonTerminal("Identifier"),
    Optional(Sequence("[", Optional(NonTerminal("Identifier")), "]"))
  )
);
