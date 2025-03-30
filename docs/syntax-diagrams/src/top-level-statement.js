export default Diagram(
  Choice(
    0,
    NonTerminal("Attribute"),
    NonTerminal("Import"),
    NonTerminal("Proc"),
    NonTerminal("Struct"),
    NonTerminal("Enum"),
    NonTerminal("Union"),
    NonTerminal("Oneof"),
    NonTerminal("Custom")
  )
);
