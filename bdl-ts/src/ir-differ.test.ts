import { test } from "node:test";
import { deepStrictEqual as assertEquals } from "node:assert/strict";
import { diffSet, diffArray, levenshtein } from "./ir-differ.ts";
test("diffSet", () => {
  assertEquals(
    diffSet(new Set([1, 2, 3, 4]), new Set([2, 3, 5])),
    [["remove", 1], ["remove", 4], ["keep", 2, 2], ["keep", 3, 3], ["add", 5]],
  );
});
test("diffArray", () => {
  assertEquals(
    diffArray([1, 2, 3, 4], [2, 3, 5]),
    [["remove", 1], ["keep", 2, 2], ["keep", 3, 3], ["replace", 4, 5]],
  );
});
test("levenshtein", () => {
  assertEquals(
    levenshtein([1, 2, 3, 4], [2, 3, 5]),
    [[0, 1, 2, 3], [1, 1, 1, 1], [2, 0, 1, 1], [3, 1, 0, 1], [4, 1, 1, 1]],
  );
});