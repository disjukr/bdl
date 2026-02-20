import { formatBdl } from "./bdl.ts";

interface Scenario {
  name: string;
  input: string;
  iterations: number;
}

const BASELINE_MS: Partial<Record<string, { cacheOff: number; cacheOn: number }>> = {
  "formatter/plain/small": { cacheOff: 0.8074, cacheOn: 0.6885 },
  "formatter/plain/large": { cacheOff: 60.4, cacheOn: 58.0 },
  "formatter/comment-heavy/large": { cacheOff: 18.9, cacheOn: 17.9 },
};

const REGRESSION_THRESHOLD = 0.2;

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

function measureAverageMs(
  input: string,
  iterations: number,
  triviaCache: boolean,
): number {
  for (let i = 0; i < 5; i++) {
    formatBdl(input, { triviaCache, finalNewline: false });
  }
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    formatBdl(input, { triviaCache, finalNewline: false });
  }
  const elapsed = performance.now() - start;
  return elapsed / iterations;
}

function formatDelta(current: number, baseline: number): string {
  const ratio = (current - baseline) / baseline;
  const sign = ratio > 0 ? "+" : "";
  return `${sign}${(ratio * 100).toFixed(1)}%`;
}

function regressionStatus(current: number, baseline: number): string {
  const ratio = (current - baseline) / baseline;
  return ratio > REGRESSION_THRESHOLD ? "REGRESSION" : "OK";
}

const scenarios: Scenario[] = [
  { name: "formatter/plain/small", input: buildSchema(20), iterations: 300 },
  { name: "formatter/plain/medium", input: buildSchema(200), iterations: 80 },
  { name: "formatter/plain/large", input: buildSchema(1000), iterations: 15 },
  { name: "formatter/comment-heavy/small", input: buildCommentHeavySchema(20), iterations: 200 },
  { name: "formatter/comment-heavy/medium", input: buildCommentHeavySchema(200), iterations: 60 },
  { name: "formatter/comment-heavy/large", input: buildCommentHeavySchema(400), iterations: 20 },
];

for (const scenario of scenarios) {
  const cacheOff = measureAverageMs(scenario.input, scenario.iterations, false);
  const cacheOn = measureAverageMs(scenario.input, scenario.iterations, true);
  const speedup = ((cacheOff - cacheOn) / cacheOff) * 100;
  console.log(`${scenario.name}`);
  console.log(`  cache-off: ${cacheOff.toFixed(3)}ms`);
  console.log(`  cache-on : ${cacheOn.toFixed(3)}ms`);
  console.log(`  speedup  : ${speedup.toFixed(1)}%`);

  const baseline = BASELINE_MS[scenario.name];
  if (baseline) {
    console.log(
      `  baseline(off/on): ${baseline.cacheOff.toFixed(3)}ms / ${baseline.cacheOn.toFixed(3)}ms`,
    );
    console.log(
      `  vs baseline off : ${formatDelta(cacheOff, baseline.cacheOff)} (${regressionStatus(cacheOff, baseline.cacheOff)})`,
    );
    console.log(
      `  vs baseline on  : ${formatDelta(cacheOn, baseline.cacheOn)} (${regressionStatus(cacheOn, baseline.cacheOn)})`,
    );
  }
}
