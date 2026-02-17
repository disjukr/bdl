import { formatBdl } from "./bdl.ts";

function buildSchema(repeat: number): string {
  const parts: string[] = [];
  for (let i = 0; i < repeat; i++) {
    parts.push(`struct User${i} { id: string, name: string, age: int32, }`);
    parts.push(`enum Role${i} { Admin, User, Guest }`);
    parts.push(`oneof Value${i} { A, B, C, D }`);
    parts.push(
      `proc GetUser${i} = GetUserInput${i} -> GetUserOutput${i} throws GetUserError${i}`,
    );
    parts.push(`custom Amount${i} = int64[string]`);
  }
  return parts.join("\n\n");
}

const small = buildSchema(20);
const medium = buildSchema(200);
const large = buildSchema(1000);

Deno.bench("formatter/small", () => {
  formatBdl(small);
});

Deno.bench("formatter/medium", () => {
  formatBdl(medium);
});

Deno.bench("formatter/large", () => {
  formatBdl(large);
});
