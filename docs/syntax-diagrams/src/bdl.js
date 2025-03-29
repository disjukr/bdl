export default Diagram(
  ZeroOrMore(Choice(1, NonTerminal("WS"), NonTerminal("Top Level Statement")))
);
