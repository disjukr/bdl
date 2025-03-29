export default Diagram(
  ZeroOrMore(Choice(0, "\\x20", "\\t", "\\r", "\\n", NonTerminal("Comment")))
);
