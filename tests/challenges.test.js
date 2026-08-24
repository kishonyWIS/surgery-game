"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { analyzeComplex, findMatchingAssignments } = require("../homology.js");
const { generateRandomChallenge } = require("../random-challenge.js");

function load(id) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "challenges", `${id}.json`), "utf8"),
  );
}

function complexFrom(challenge, extraEdges = [], faces = []) {
  return {
    vertices: challenge.vertices,
    edges: [...challenge.edges, ...extraEdges],
    faces,
  };
}

function assertValid(id, complex) {
  const challenge = load(id);
  const report = analyzeComplex(complex, challenge.caps);
  assert.strictEqual(
    report.valid,
    true,
    `${id}: ${report.issues.map((issue) => issue.message).join(" | ")}`,
  );
}

{
  const challenge = load("square");
  assertValid(
    "square",
    complexFrom(challenge, [], [{ id: "f0", boundaryEdgeIds: ["g0", "g1", "g2", "g3"] }]),
  );
}

{
  const challenge = load("triangles");
  const diagonal = { id: "d02", source: "q0", target: "q2", type: "filling" };
  assertValid(
    "triangles",
    complexFrom(challenge, [diagonal], [
      { id: "f0", boundaryEdgeIds: ["g0", "g1", "d02"] },
      { id: "f1", boundaryEdgeIds: ["g2", "g3", "d02"] },
    ]),
  );
}

{
  const challenge = load("cone-trap");
  const diagonals = [
    ["d02", "q0", "q2"],
    ["d03", "q0", "q3"],
    ["d37", "q3", "q7"],
    ["d46", "q4", "q6"],
    ["d47", "q4", "q7"],
  ].map(([id, source, target]) => ({ id, source, target, type: "filling" }));
  assertValid(
    "cone-trap",
    complexFrom(challenge, diagonals, [
      { id: "f0", boundaryEdgeIds: ["g0", "g1", "d02"] },
      { id: "f1", boundaryEdgeIds: ["d02", "g2", "d03"] },
      { id: "f2", boundaryEdgeIds: ["d03", "d37", "g7"] },
      { id: "f3", boundaryEdgeIds: ["g3", "d47", "d37"] },
      { id: "f4", boundaryEdgeIds: ["d46", "g6", "d47"] },
      { id: "f5", boundaryEdgeIds: ["g4", "g5", "d46"] },
    ]),
  );
}

{
  const challenge = load("theta");
  assertValid(
    "theta",
    complexFrom(challenge, [], [
      { id: "f0", boundaryEdgeIds: ["gu0", "gu1", "gv0", "gv1"] },
      { id: "f1", boundaryEdgeIds: ["gv0", "gv1", "gw0", "gw1"] },
    ]),
  );
}

{
  const challenge = load("pairing");
  // The size-two overlap of Z3 is placed for the player and is then reused by
  // the four-qubit overlaps of Z0 and Z2.
  const forced = { id: "pair-z3-0", source: "q0", target: "q1", type: "measurement_required" };
  const matchingEdges = [
    { id: "m23", source: "q2", target: "q3", type: "edge" },
    { id: "m45", source: "q4", target: "q5", type: "edge" },
  ];
  const connectors = [
    { id: "c12", source: "q1", target: "q2", type: "edge" },
    { id: "c34", source: "q3", target: "q4", type: "edge" },
  ];
  const complex = complexFrom(challenge, [forced, ...matchingEdges, ...connectors]);
  assertValid("pairing", complex);

  const requirements = challenge.zChecks.map((check) => ({
    id: check.id,
    vertexIds: check.support.filter((vertexId) => challenge.logicalX.includes(vertexId)),
  }));
  assert.ok(
    findMatchingAssignments(complex, requirements),
    "pairing: every even Z-overlap needs a perfect matching",
  );
}

{
  const challenge = load("ring");
  const forced = [
    ["z0", "q0", "q1"],
    ["z1", "q2", "q3"],
    ["z2", "q4", "q5"],
    ["z3", "q6", "q7"],
    ["z4", "q8", "q9"],
    ["z5", "q10", "q11"],
  ].map(([checkId, source, target]) => ({
    id: `pair-${checkId}-0`,
    source,
    target,
    type: "measurement_required",
  }));
  // Each four-qubit overlap reuses a forced edge, so one chord completes it.
  const chords = [
    ["p14", "q1", "q4"],
    ["p58", "q5", "q8"],
    ["p90", "q9", "q0"],
  ].map(([id, source, target]) => ({ id, source, target, type: "edge" }));
  // The three chords close a six-cycle; q1-q8 splits it into two weight-four faces.
  const split = { id: "s18", source: "q1", target: "q8", type: "edge" };
  const connectors = [
    ["c34", "q3", "q4"],
    ["c56", "q5", "q6"],
    ["c11", "q11", "q0"],
  ].map(([id, source, target]) => ({ id, source, target, type: "edge" }));

  const complex = complexFrom(
    challenge,
    [...forced, ...chords, split, ...connectors],
    [
      { id: "f0", boundaryEdgeIds: ["s18", "p14", "pair-z2-0", "p58"] },
      { id: "f1", boundaryEdgeIds: ["s18", "pair-z4-0", "p90", "pair-z0-0"] },
    ],
  );
  assertValid("ring", complex);

  const requirements = challenge.zChecks.map((check) => ({
    id: check.id,
    vertexIds: check.support.filter((vertexId) => challenge.logicalX.includes(vertexId)),
  }));
  assert.ok(
    findMatchingAssignments(complex, requirements),
    "ring: every even Z-overlap needs a perfect matching",
  );
}

{
  const signatures = new Set();
  for (let seed = 1; seed <= 250; seed += 1) {
    const challenge = generateRandomChallenge(seed);
    const solved = {
      vertices: challenge.vertices,
      edges: challenge.edges,
      faces: challenge.solutionFaces,
    };
    const report = analyzeComplex(solved, challenge.caps);
    assert.strictEqual(
      report.valid,
      true,
      `random seed ${seed}: ${report.issues.map((issue) => issue.message).join(" | ")}`,
    );
    assert.ok(challenge.vertices.length >= 10 && challenge.vertices.length <= 14);
    assert.strictEqual(challenge.solutionFaces.length, challenge.vertices.length - 2);
    signatures.add(
      challenge.edges.map((edge) => [edge.source, edge.target].sort().join("-")).sort().join(","),
    );
  }
  assert.ok(signatures.size > 200, "random generator should produce varied triangulations");
}

console.log("PASS  all seven campaign challenges have a valid bounded-load solution");
