"use strict";

const assert = require("assert");
const homology = require("../homology.js");

/* Minimal runner so the file stays dependency-free: node tests/homology.test.js */
const tests = [];

function test(name, run) {
  tests.push({ name, run });
}

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

function squareSkeleton() {
  return {
    vertices: [{ id: "v0" }, { id: "v1" }, { id: "v2" }, { id: "v3" }],
    edges: [
      { id: "e0", source: "v0", target: "v1", type: "measurement" },
      { id: "e1", source: "v1", target: "v2", type: "measurement" },
      { id: "e2", source: "v2", target: "v3", type: "measurement" },
      { id: "e3", source: "v3", target: "v0", type: "measurement" },
    ],
    faces: [],
  };
}

function withFaces(...faces) {
  const complex = squareSkeleton();
  complex.faces = faces;
  return complex;
}

const SQUARE_BOUNDARY = ["e0", "e1", "e2", "e3"];

/* ------------------------------------------------------------------ *
 * Required cases
 * ------------------------------------------------------------------ */

test("empty 4-cycle has beta1 = 1 and reports an unfilled cycle", () => {
  const report = homology.analyzeComplex(squareSkeleton());

  assert.strictEqual(report.metrics.beta0, 1);
  assert.strictEqual(report.metrics.beta1, 1);
  assert.strictEqual(report.metrics.beta2, 0);
  assert.strictEqual(report.valid, false);
  assert.deepStrictEqual(
    report.issues.map((issue) => issue.code),
    ["NONTRIVIAL_H1"]
  );
  assert.deepStrictEqual(report.witnesses.unfilledCycle.edgeIds, SQUARE_BOUNDARY);
});

test("one square face gives beta1 = beta2 = 0 and a valid complex", () => {
  const report = homology.analyzeComplex(withFaces({ id: "f0", boundaryEdgeIds: SQUARE_BOUNDARY }));

  assert.strictEqual(report.metrics.beta0, 1);
  assert.strictEqual(report.metrics.beta1, 0);
  assert.strictEqual(report.metrics.beta2, 0);
  assert.strictEqual(report.metrics.rankBoundary1, 3);
  assert.strictEqual(report.metrics.rankBoundary2, 1);
  assert.deepStrictEqual(report.issues, []);
  assert.strictEqual(report.valid, true);
  assert.strictEqual(report.witnesses.unfilledCycle, null);
});

test("a duplicated square face gives beta2 = 1 and a redundant-face witness", () => {
  const report = homology.analyzeComplex(
    withFaces(
      { id: "f0", boundaryEdgeIds: SQUARE_BOUNDARY },
      { id: "f1", boundaryEdgeIds: SQUARE_BOUNDARY }
    )
  );

  assert.strictEqual(report.metrics.beta1, 0);
  assert.strictEqual(report.metrics.beta2, 1);
  assert.strictEqual(report.metrics.rankBoundary2, 1);
  assert.strictEqual(report.valid, false);
  assert.deepStrictEqual(
    report.issues.map((issue) => issue.code),
    ["NONTRIVIAL_H2"]
  );
  assert.deepStrictEqual(report.witnesses.redundantFaces.faceIds, ["f0", "f1"]);
});

test("a tree has beta1 = 0 with no faces", () => {
  const report = homology.analyzeComplex({
    vertices: [{ id: "v0" }, { id: "v1" }, { id: "v2" }, { id: "v3" }],
    edges: [
      { id: "e0", source: "v0", target: "v1", type: "routing" },
      { id: "e1", source: "v1", target: "v2", type: "routing" },
      { id: "e2", source: "v1", target: "v3", type: "routing" },
    ],
    faces: [],
  });

  assert.strictEqual(report.metrics.beta0, 1);
  assert.strictEqual(report.metrics.beta1, 0);
  assert.strictEqual(report.metrics.beta2, 0);
  assert.strictEqual(report.metrics.maxVertexDegree, 3);
  assert.strictEqual(report.valid, true);
});

test("an open path is rejected as a malformed face", () => {
  const report = homology.analyzeComplex(withFaces({ id: "f0", boundaryEdgeIds: ["e0", "e1", "e2"] }));

  assert.strictEqual(report.valid, false);
  assert.strictEqual(report.issues[0].code, "MALFORMED_FACE");
  assert.strictEqual(report.issues[0].faceId, "f0");
  assert.ok(report.issues[0].reasons.includes("boundaryNotClosed"));
  assert.deepStrictEqual(report.issues[0].vertexIds.sort(), ["v0", "v3"]);
  // A face that is not closed must not contribute a column to d2.
  assert.strictEqual(report.metrics.rankBoundary2, 0);
  assert.strictEqual(report.metrics.beta1, 1);
});

test("a 2-cycle of parallel edges is an accepted face", () => {
  const report = homology.analyzeComplex({
    vertices: [{ id: "v0" }, { id: "v1" }],
    edges: [
      { id: "e0", source: "v0", target: "v1", type: "measurement" },
      { id: "e1", source: "v0", target: "v1", type: "filling" },
    ],
    faces: [{ id: "f0", boundaryEdgeIds: ["e0", "e1"] }],
  });

  assert.strictEqual(report.metrics.beta0, 1);
  assert.strictEqual(report.metrics.beta1, 0);
  assert.strictEqual(report.metrics.beta2, 0);
  assert.strictEqual(report.metrics.maxFaceWeight, 2);
  assert.deepStrictEqual(report.issues, []);
  assert.strictEqual(report.valid, true);
});

/* ------------------------------------------------------------------ *
 * Supporting cases
 * ------------------------------------------------------------------ */

test("GF(2) rank and RREF agree on a small dependent set", () => {
  const vectors = [0b0011n, 0b0110n, 0b0101n, 0b0000n];

  assert.strictEqual(homology.gf2Rank(vectors), 2);

  const rref = homology.gf2Rref(vectors);
  assert.strictEqual(rref.rank, 2);
  assert.deepStrictEqual(rref.pivots, [2, 1]);
  // Each pivot column is set in exactly one row.
  for (const pivot of rref.pivots) {
    const hits = rref.rows.filter((row) => (row >> BigInt(pivot)) & 1n).length;
    assert.strictEqual(hits, 1);
  }

  const basis = homology.gf2Basis(vectors);
  assert.strictEqual(homology.gf2InSpan(0b0101n, basis), true);
  assert.strictEqual(homology.gf2InSpan(0b1000n, basis), false);
});

test("parallel edges count separately in degrees and congestion", () => {
  const report = homology.analyzeComplex({
    vertices: [{ id: "v0" }, { id: "v1" }, { id: "v2" }],
    edges: [
      { id: "e0", source: "v0", target: "v1", type: "measurement" },
      { id: "e1", source: "v0", target: "v1", type: "filling" },
      { id: "e2", source: "v1", target: "v2", type: "filling" },
      { id: "e3", source: "v1", target: "v2", type: "filling" },
    ],
    faces: [
      { id: "f0", boundaryEdgeIds: ["e0", "e1"] },
      { id: "f1", boundaryEdgeIds: ["e2", "e3"] },
    ],
  });

  assert.strictEqual(report.metrics.vertexDegrees.v1, 4);
  assert.strictEqual(report.metrics.edgeCongestion.e0, 1);
  assert.strictEqual(report.metrics.maxFacesPerEdge, 1);
  assert.strictEqual(report.valid, true);
});

test("disconnected pieces raise beta0 and are listed as extra components", () => {
  const complex = squareSkeleton();
  complex.faces = [{ id: "f0", boundaryEdgeIds: SQUARE_BOUNDARY }];
  complex.vertices.push({ id: "v4" }, { id: "v5" });
  complex.edges.push({ id: "e4", source: "v4", target: "v5", type: "filling" });

  const report = homology.analyzeComplex(complex);

  assert.strictEqual(report.metrics.beta0, 2);
  assert.strictEqual(report.metrics.componentCount, 2);
  assert.deepStrictEqual(
    report.issues.map((issue) => issue.code),
    ["DISCONNECTED_COMPONENT"]
  );
  assert.deepStrictEqual(report.witnesses.extraComponents, [["v4", "v5"]]);
  assert.deepStrictEqual(homology.connectedComponents(complex), [["v0", "v1", "v2", "v3"], ["v4", "v5"]]);
});

test("caps flag vertex degree, face weight and edge congestion", () => {
  const complex = withFaces(
    { id: "f0", boundaryEdgeIds: SQUARE_BOUNDARY },
    { id: "f1", boundaryEdgeIds: ["e0", "e1", "e2", "e3"] }
  );
  const report = homology.analyzeComplex(complex, {
    maxVertexDegree: 1,
    maxFaceWeight: 3,
    maxFacesPerEdge: 1,
  });

  const codes = new Set(report.issues.map((issue) => issue.code));
  assert.ok(codes.has("OVERLOADED_VERTEX"));
  assert.ok(codes.has("OVERLOADED_FACE"));
  assert.ok(codes.has("CONGESTED_EDGE"));
  assert.strictEqual(report.witnesses.overloads.vertices.length, 4);
  assert.strictEqual(report.witnesses.overloads.faces.length, 2);
  assert.strictEqual(report.witnesses.overloads.edges.length, 4);
  assert.strictEqual(report.witnesses.overloads.vertices[0].degree, 2);

  // Without caps the same load is unlimited.
  const unlimited = homology.analyzeComplex(complex);
  assert.strictEqual(
    unlimited.issues.every((issue) => issue.code === "NONTRIVIAL_H2"),
    true
  );
});

test("issues are ordered malformed face, extra component, unfilled cycle, overload", () => {
  const complex = squareSkeleton();
  complex.faces = [{ id: "f0", boundaryEdgeIds: ["e0", "e1", "e2"] }];
  complex.vertices.push({ id: "v4" }, { id: "v5" });
  complex.edges.push({ id: "e4", source: "v4", target: "v5", type: "filling" });

  const report = homology.analyzeComplex(complex, { maxVertexDegree: 1 });
  const distinctCodes = report.issues
    .map((issue) => issue.code)
    .filter((code, index, all) => all.indexOf(code) === index);

  assert.deepStrictEqual(distinctCodes, [
    "MALFORMED_FACE",
    "DISCONNECTED_COMPONENT",
    "NONTRIVIAL_H1",
    "OVERLOADED_VERTEX",
  ]);
});

test("the cycle witness is a real cycle outside the image of d2", () => {
  // Two squares sharing edge e1, only the left one filled.
  const complex = {
    vertices: [{ id: "v0" }, { id: "v1" }, { id: "v2" }, { id: "v3" }, { id: "v4" }, { id: "v5" }],
    edges: [
      { id: "e0", source: "v0", target: "v1", type: "measurement" },
      { id: "e1", source: "v1", target: "v2", type: "measurement" },
      { id: "e2", source: "v2", target: "v3", type: "measurement" },
      { id: "e3", source: "v3", target: "v0", type: "measurement" },
      { id: "e4", source: "v1", target: "v4", type: "filling" },
      { id: "e5", source: "v4", target: "v5", type: "filling" },
      { id: "e6", source: "v5", target: "v2", type: "filling" },
    ],
    faces: [{ id: "f0", boundaryEdgeIds: SQUARE_BOUNDARY }],
  };

  const report = homology.analyzeComplex(complex);
  assert.strictEqual(report.metrics.beta1, 1);

  const witness = report.witnesses.unfilledCycle;
  assert.deepStrictEqual(witness.edgeIds, ["e1", "e4", "e5", "e6"]);

  const indexed = homology.indexComplex(complex);
  const witnessVector = homology.gf2FromIndices(
    witness.edgeIds.map((edgeId) => indexed.edgeIndex.get(edgeId))
  );

  // d1 of the witness must vanish: it is a cycle.
  const columns1 = homology.boundary1Columns(indexed);
  let image = 0n;
  for (const index of homology.gf2Indices(witnessVector)) {
    image ^= columns1[index];
  }
  assert.strictEqual(image, 0n);

  // And it must not be a combination of face boundaries.
  const faceReports = indexed.faces.map((face) => homology.validateFace(face, indexed));
  const faceBasis = homology.gf2Basis(homology.boundary2Columns(indexed, faceReports).columns);
  assert.strictEqual(homology.gf2InSpan(witnessVector, faceBasis), false);
});

test("Euler characteristic matches the alternating sum of Betti numbers", () => {
  const cases = [
    squareSkeleton(),
    withFaces({ id: "f0", boundaryEdgeIds: SQUARE_BOUNDARY }),
    withFaces(
      { id: "f0", boundaryEdgeIds: SQUARE_BOUNDARY },
      { id: "f1", boundaryEdgeIds: SQUARE_BOUNDARY }
    ),
  ];

  for (const complex of cases) {
    const report = homology.analyzeComplex(complex);
    const { vertexCount, edgeCount, closedFaceCount, beta0, beta1, beta2 } = report.metrics;
    assert.strictEqual(beta0 - beta1 + beta2, vertexCount - edgeCount + closedFaceCount);
  }
});

test("malformed boundaries are detected for every failure mode", () => {
  const complex = {
    vertices: [{ id: "v0" }, { id: "v1" }, { id: "v2" }, { id: "v3" }, { id: "v4" }],
    edges: [
      { id: "e0", source: "v0", target: "v1", type: "measurement" },
      { id: "e1", source: "v1", target: "v2", type: "measurement" },
      { id: "e2", source: "v2", target: "v0", type: "measurement" },
      { id: "e3", source: "v2", target: "v3", type: "filling" },
      { id: "e4", source: "v3", target: "v4", type: "filling" },
      { id: "e5", source: "v4", target: "v2", type: "filling" },
      { id: "loop", source: "v0", target: "v0", type: "filling" },
    ],
    faces: [],
  };
  const indexed = homology.indexComplex(complex);
  const reasonsFor = (boundaryEdgeIds) =>
    homology.validateFace({ id: "f", boundaryEdgeIds }, indexed).reasons;

  assert.deepStrictEqual(homology.validateFace({ id: "f", boundaryEdgeIds: ["e0", "e1", "e2"] }, indexed).valid, true);
  assert.deepStrictEqual(reasonsFor([]), ["emptyBoundary"]);
  assert.deepStrictEqual(reasonsFor(["nope"]), ["unknownBoundaryEdge"]);
  assert.deepStrictEqual(reasonsFor(["e0", "e0"]), ["repeatedBoundaryEdge", "boundaryNotClosed"]);
  assert.deepStrictEqual(reasonsFor(["loop"]), ["selfLoopInBoundary"]);
  assert.deepStrictEqual(reasonsFor(["e0", "e1"]), ["boundaryNotClosed"]);
  // Two triangles meeting at v2: closed, but two cycles rather than one simple cycle.
  assert.deepStrictEqual(reasonsFor(["e0", "e1", "e2", "e3", "e4", "e5"]), ["vertexUsedMoreThanTwice"]);
  // Two disjoint cycles cannot both be one face either.
  const disjoint = homology.validateFace(
    { id: "f", boundaryEdgeIds: ["e0", "e1", "e2", "e3", "e5"] },
    indexed
  );
  assert.strictEqual(disjoint.valid, false);
});

test("structural defects are reported without corrupting the algebra", () => {
  const report = homology.analyzeComplex({
    vertices: [{ id: "v0" }, { id: "v1" }, { id: "v1" }],
    edges: [
      { id: "e0", source: "v0", target: "v1", type: "filling" },
      { id: "e1", source: "v0", target: "ghost", type: "filling" },
    ],
    faces: [],
  });

  assert.strictEqual(report.metrics.vertexCount, 2);
  assert.strictEqual(report.metrics.edgeCount, 1);
  assert.strictEqual(report.metrics.beta0, 1);
  assert.deepStrictEqual(
    report.issues.map((issue) => issue.code),
    ["STRUCTURAL_DEFECT", "STRUCTURAL_DEFECT"]
  );
  assert.deepStrictEqual(
    report.witnesses.structuralDefects.map((defect) => defect.kind),
    ["duplicateVertexId", "unknownEdgeEndpoint"]
  );
});

test("an empty complex is reported rather than silently accepted", () => {
  const report = homology.analyzeComplex({ vertices: [], edges: [], faces: [] });

  assert.strictEqual(report.metrics.beta0, 0);
  assert.strictEqual(report.valid, false);
  assert.strictEqual(report.issues[0].code, "EMPTY_COMPLEX");
});

test("Z-overlap matching may use any subset of a graph with extra edges", () => {
  const complex = {
    vertices: [{ id: "q0" }, { id: "q1" }, { id: "q2" }, { id: "q3" }],
    edges: [
      { id: "extra", source: "q0", target: "q2" },
      { id: "pair-a", source: "q0", target: "q1" },
      { id: "pair-b", source: "q2", target: "q3" },
      { id: "more-extra", source: "q1", target: "q2" },
    ],
    faces: [],
  };

  assert.deepStrictEqual(
    homology.findPerfectMatching(complex, ["q0", "q1", "q2", "q3"]),
    [
      { first: "q0", second: "q1", edgeId: "pair-a" },
      { first: "q2", second: "q3", edgeId: "pair-b" },
    ]
  );
  assert.strictEqual(
    homology.findPerfectMatching(
      { ...complex, edges: complex.edges.filter((edge) => edge.id !== "pair-b") },
      ["q0", "q1", "q2", "q3"]
    ),
    null
  );
});

test("Z-check overlaps may share the same matching edges", () => {
  const complex = {
    vertices: [{ id: "q0" }, { id: "q1" }, { id: "q2" }, { id: "q3" }],
    edges: [
      { id: "shared", source: "q0", target: "q1" },
      { id: "extra", source: "q0", target: "q3" },
    ],
    faces: [],
  };
  const requirements = [
    { id: "z1", vertexIds: ["q0", "q1"] },
    { id: "z0", vertexIds: ["q0", "q1", "q2", "q3"] },
  ];

  assert.strictEqual(homology.findMatchingAssignments(complex, requirements), null);
  complex.edges.push({ id: "player", source: "q2", target: "q3" });

  const assignment = homology.findMatchingAssignments(complex, requirements);
  assert.deepStrictEqual(assignment.z1, [{ first: "q0", second: "q1", edgeId: "shared" }]);
  assert.deepStrictEqual(assignment.z0, [
    { first: "q0", second: "q1", edgeId: "shared" },
    { first: "q2", second: "q3", edgeId: "player" },
  ]);
});

test("a matching requirement can be restricted to specific edges", () => {
  const complex = {
    vertices: [{ id: "q0" }, { id: "q1" }],
    edges: [{ id: "wrong-check", source: "q0", target: "q1" }],
    faces: [],
  };

  assert.strictEqual(
    homology.findPerfectMatching(complex, ["q0", "q1"], { allowedEdgeIds: ["only-mine"] }),
    null
  );
  assert.deepStrictEqual(
    homology.findPerfectMatching(complex, ["q0", "q1"], { allowedEdgeIds: ["wrong-check"] }),
    [{ first: "q0", second: "q1", edgeId: "wrong-check" }]
  );
});

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

let failures = 0;

for (const { name, run } of tests) {
  try {
    run();
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL  ${name}`);
    console.log(`      ${error.message.split("\n").join("\n      ")}`);
  }
}

console.log(`\n${tests.length - failures} passed, ${failures} failed, ${tests.length} total`);
process.exitCode = failures === 0 ? 0 : 1;
