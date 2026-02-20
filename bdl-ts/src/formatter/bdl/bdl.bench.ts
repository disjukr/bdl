import { formatBdl } from "../bdl.ts";

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

function buildCommentHeavySchema(repeat: number): string {
  const parts: string[] = [];
  for (let i = 0; i < repeat; i++) {
    parts.push(`// module comment ${i}`);
    parts.push(`@ tag - value-${i}`);
    parts.push(
      `proc Proc${i} = // proc comment ${i}\nReq${i} -> Res${i} // result comment ${i}\nthrows Err${i}`,
    );
    parts.push(`struct User${i} {`);
    parts.push(`// field comment ${i}`);
    parts.push(`id: string,`);
    parts.push(`name: string,`);
    parts.push(`}`);
    parts.push(`oneof Value${i} { A, B, C, D }`);
  }
  return parts.join("\n\n");
}

function benchPair(name: string, input: string) {
  Deno.bench(`${name}/cache-off`, () => {
    formatBdl(input, { triviaCache: false });
  });
  Deno.bench(`${name}/cache-on`, () => {
    formatBdl(input, { triviaCache: true });
  });
}

const small = buildSchema(20);
const medium = buildSchema(200);
const large = buildSchema(1000);
const commentSmall = buildCommentHeavySchema(20);
const commentMedium = buildCommentHeavySchema(200);
const commentLarge = buildCommentHeavySchema(400);

benchPair("formatter/plain/small", small);
benchPair("formatter/plain/medium", medium);
benchPair("formatter/plain/large", large);
benchPair("formatter/comment-heavy/small", commentSmall);
benchPair("formatter/comment-heavy/medium", commentMedium);
benchPair("formatter/comment-heavy/large", commentLarge);
