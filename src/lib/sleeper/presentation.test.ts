import assert from "node:assert/strict";
import { it } from "node:test";
import { needLabel, depthLabel, scarcityLabel } from "./presentation.ts";

it("describes need without equating a rating with an empty starting slot", () => {
  assert.equal(needLabel("critical"), "Urgent need");
  assert.equal(needLabel("thin"), "Could use depth");
  assert.equal(depthLabel("thin"), "Limited backup depth");
  assert.equal(depthLabel("covered_by_flex"), "Covered through FLEX");
  assert.doesNotMatch(needLabel("critical"), /no starter/i);
});

it("describes league depth without claiming that waiver replacements were measured", () => {
  assert.equal(scarcityLabel("high"), "Scarce league depth");
  assert.equal(scarcityLabel("moderate"), "Limited league depth");
  assert.equal(scarcityLabel("low"), "Plentiful league depth");
  for (const value of ["high", "moderate", "low"]) {
    assert.doesNotMatch(scarcityLabel(value), /waiver/i);
  }
});

it("keeps missing labels honest and readable for unrecognized future values", () => {
  for (const display of [needLabel, depthLabel, scarcityLabel]) {
    assert.equal(display(undefined), "Unknown");
    assert.equal(display(null), "Unknown");
    assert.equal(display(""), "Unknown");
    assert.equal(display("future_value"), "future value");
  }
});
