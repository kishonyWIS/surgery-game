/**
 * Homology and validation engine for the ancilla-architect complex.
 *
 * Domain objects:
 *   vertex: { id }
 *   edge:   { id, source, target, type }
 *   face:   { id, boundaryEdgeIds }
 *
 * Parallel edges are distinct edge IDs between the same endpoints and are always
 * counted separately. Faces are abstract 2-cells identified by their edge-incidence
 * vector, never by a drawn polygon.
 *
 * Chain complex over GF(2):
 *   d1(edge) = source + target
 *   d2(face) = sum of its boundary edges
 *   beta0 = |V| - rank(d1)
 *   beta1 = |E| - rank(d1) - rank(d2)
 *   beta2 = |F| - rank(d2)
 *
 * The beta1 expression is only meaningful once d1 d2 = 0, so faces whose boundary is
 * not a cycle are excluded from d2 and reported as malformed instead.
 */
(function () {
  "use strict";

  const UNLIMITED = Infinity;

  /* ------------------------------------------------------------------ *
   * GF(2) linear algebra. A vector is a BigInt used as a bitset:
   * bit i is the coefficient of basis element i, addition is XOR.
   * ------------------------------------------------------------------ */

  function gf2Bit(index) {
    return 1n << BigInt(index);
  }

  function gf2FromIndices(indices) {
    let vector = 0n;
    for (const index of indices) {
      vector ^= gf2Bit(index);
    }
    return vector;
  }

  function gf2Indices(vector) {
    const indices = [];
    let remaining = vector;
    let index = 0;
    while (remaining !== 0n) {
      if (remaining & 1n) {
        indices.push(index);
      }
      remaining >>= 1n;
      index += 1;
    }
    return indices;
  }

  function gf2Weight(vector) {
    return gf2Indices(vector).length;
  }

  /** Index of the most significant set bit, or -1 for the zero vector. */
  function gf2LeadingIndex(vector) {
    if (vector <= 0n) {
      return -1;
    }
    return vector.toString(2).length - 1;
  }

  /**
   * Gaussian elimination with dependency tracking.
   *
   * Returns the pivot rows of the row echelon form and, for every input vector that
   * reduced to zero, the XOR combination of input indices that produced it. Those
   * combinations are exactly the nonzero kernel elements found so far.
   */
  function gf2Eliminate(vectors) {
    const pivotRows = new Map();
    const dependencies = [];

    vectors.forEach((vector, inputIndex) => {
      let residual = vector;
      let combination = gf2Bit(inputIndex);

      while (residual !== 0n) {
        const pivot = gf2LeadingIndex(residual);
        const known = pivotRows.get(pivot);
        if (!known) {
          break;
        }
        residual ^= known.vector;
        combination ^= known.combination;
      }

      if (residual === 0n) {
        dependencies.push({ index: inputIndex, combination });
      } else {
        pivotRows.set(gf2LeadingIndex(residual), { vector: residual, combination });
      }
    });

    return { pivotRows, rank: pivotRows.size, dependencies };
  }

  function gf2Rank(vectors) {
    return gf2Eliminate(vectors).rank;
  }

  /** Reduced row echelon form: each pivot column is cleared in every other row. */
  function gf2Rref(vectors) {
    const { pivotRows } = gf2Eliminate(vectors);
    const pivots = Array.from(pivotRows.keys()).sort((left, right) => right - left);
    const rows = pivots.map((pivot) => pivotRows.get(pivot).vector);

    for (let source = 0; source < rows.length; source += 1) {
      for (let target = 0; target < rows.length; target += 1) {
        if (source !== target && (rows[target] >> BigInt(pivots[source])) & 1n) {
          rows[target] ^= rows[source];
        }
      }
    }

    return { rows, pivots, rank: pivots.length };
  }

  /** Span basis keyed by pivot index, for membership queries. */
  function gf2Basis(vectors) {
    const basis = new Map();
    for (const [pivot, row] of gf2Eliminate(vectors).pivotRows) {
      basis.set(pivot, row.vector);
    }
    return basis;
  }

  function gf2Reduce(vector, basis) {
    let residual = vector;
    while (residual !== 0n) {
      const pivot = gf2LeadingIndex(residual);
      const row = basis.get(pivot);
      if (!row) {
        break;
      }
      residual ^= row;
    }
    return residual;
  }

  function gf2InSpan(vector, basis) {
    return gf2Reduce(vector, basis) === 0n;
  }

  /* ------------------------------------------------------------------ *
   * Indexing
   * ------------------------------------------------------------------ */

  /**
   * Assign deterministic indices to vertices, edges and faces in input order.
   *
   * Structurally broken cells are dropped from the chain complex and recorded in
   * `defects` so that the caller can report them without corrupting the algebra:
   * repeated IDs and edges pointing at unknown vertices.
   */
  function indexComplex(complex) {
    const vertices = [];
    const edges = [];
    const faces = [];
    const vertexIndex = new Map();
    const edgeIndex = new Map();
    const faceIndex = new Map();
    const defects = [];

    for (const vertex of complex.vertices ?? []) {
      if (vertexIndex.has(vertex.id)) {
        defects.push({ kind: "duplicateVertexId", id: vertex.id });
        continue;
      }
      vertexIndex.set(vertex.id, vertices.length);
      vertices.push(vertex);
    }

    for (const edge of complex.edges ?? []) {
      if (edgeIndex.has(edge.id)) {
        defects.push({ kind: "duplicateEdgeId", id: edge.id });
        continue;
      }
      if (!vertexIndex.has(edge.source) || !vertexIndex.has(edge.target)) {
        defects.push({ kind: "unknownEdgeEndpoint", id: edge.id });
        continue;
      }
      edgeIndex.set(edge.id, edges.length);
      edges.push(edge);
    }

    for (const face of complex.faces ?? []) {
      if (faceIndex.has(face.id)) {
        defects.push({ kind: "duplicateFaceId", id: face.id });
        continue;
      }
      faceIndex.set(face.id, faces.length);
      faces.push(face);
    }

    return { vertices, edges, faces, vertexIndex, edgeIndex, faceIndex, defects };
  }

  /* ------------------------------------------------------------------ *
   * Boundary maps
   * ------------------------------------------------------------------ */

  /** Columns of d1 in vertex space. A self-loop contributes the zero column. */
  function boundary1Columns(indexed) {
    return indexed.edges.map((edge) =>
      gf2Bit(indexed.vertexIndex.get(edge.source)) ^ gf2Bit(indexed.vertexIndex.get(edge.target))
    );
  }

  /** Column of one face in edge space, restricted to edges that exist. */
  function faceBoundaryVector(face, indexed) {
    const indices = [];
    for (const edgeId of face.boundaryEdgeIds ?? []) {
      const index = indexed.edgeIndex.get(edgeId);
      if (index !== undefined) {
        indices.push(index);
      }
    }
    return gf2FromIndices(indices);
  }

  /**
   * Columns of d2, taken only from faces whose boundary is a genuine cycle. The
   * returned `faceIds` array maps column positions back to face IDs.
   */
  function boundary2Columns(indexed, faceReports) {
    const columns = [];
    const faceIds = [];

    indexed.faces.forEach((face, index) => {
      if (faceReports[index].closed) {
        columns.push(faceBoundaryVector(face, indexed));
        faceIds.push(face.id);
      }
    });

    return { columns, faceIds };
  }

  /* ------------------------------------------------------------------ *
   * Face validation
   * ------------------------------------------------------------------ */

  /**
   * A face boundary is valid for this game mode when it is exactly one connected
   * simple cycle: no repeated or unknown edges, no self-loops, every touched vertex
   * incident to exactly two boundary edges, and the boundary connected. A length-two
   * cycle formed by two parallel edges satisfies this and is accepted.
   *
   * `closed` is the weaker algebraic condition d1 d2 = 0, which is what decides
   * whether the face may contribute a column to d2.
   */
  function validateFace(face, indexed) {
    const reasons = [];
    const boundaryEdgeIds = face.boundaryEdgeIds ?? [];
    const seenEdgeIds = new Set();
    const edgeIndices = [];
    let hasUnknownEdge = false;
    let hasRepeatedEdge = false;

    for (const edgeId of boundaryEdgeIds) {
      const index = indexed.edgeIndex.get(edgeId);
      if (index === undefined) {
        hasUnknownEdge = true;
        continue;
      }
      if (seenEdgeIds.has(edgeId)) {
        hasRepeatedEdge = true;
        continue;
      }
      seenEdgeIds.add(edgeId);
      edgeIndices.push(index);
    }

    if (hasUnknownEdge) {
      reasons.push("unknownBoundaryEdge");
    }
    if (hasRepeatedEdge) {
      reasons.push("repeatedBoundaryEdge");
    }
    if (boundaryEdgeIds.length === 0) {
      reasons.push("emptyBoundary");
    }

    const degrees = new Map();
    let hasSelfLoop = false;

    for (const index of edgeIndices) {
      const edge = indexed.edges[index];
      if (edge.source === edge.target) {
        hasSelfLoop = true;
      }
      degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
      degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
    }

    if (hasSelfLoop) {
      reasons.push("selfLoopInBoundary");
    }

    const oddVertexIds = [];
    const wrongDegreeVertexIds = [];
    for (const [vertexId, degree] of degrees) {
      if (degree % 2 !== 0) {
        oddVertexIds.push(vertexId);
      } else if (degree !== 2) {
        wrongDegreeVertexIds.push(vertexId);
      }
    }

    if (oddVertexIds.length > 0) {
      reasons.push("boundaryNotClosed");
    }
    if (wrongDegreeVertexIds.length > 0) {
      reasons.push("vertexUsedMoreThanTwice");
    }
    if (edgeIndices.length > 0 && !isEdgeSubgraphConnected(edgeIndices, indexed)) {
      reasons.push("disconnectedBoundary");
    }

    return {
      faceId: face.id,
      valid: reasons.length === 0,
      closed: !hasUnknownEdge && !hasRepeatedEdge && oddVertexIds.length === 0 && boundaryEdgeIds.length > 0,
      reasons,
      edgeIds: edgeIndices.map((index) => indexed.edges[index].id),
      vertexIds: Array.from(degrees.keys()),
      oddVertexIds,
      weight: seenEdgeIds.size,
    };
  }

  function isEdgeSubgraphConnected(edgeIndices, indexed) {
    const adjacency = new Map();
    for (const index of edgeIndices) {
      const edge = indexed.edges[index];
      if (!adjacency.has(edge.source)) {
        adjacency.set(edge.source, []);
      }
      if (!adjacency.has(edge.target)) {
        adjacency.set(edge.target, []);
      }
      adjacency.get(edge.source).push(edge.target);
      adjacency.get(edge.target).push(edge.source);
    }

    const start = indexed.edges[edgeIndices[0]].source;
    const visited = new Set([start]);
    const queue = [start];

    while (queue.length > 0) {
      const current = queue.pop();
      for (const neighbour of adjacency.get(current) ?? []) {
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          queue.push(neighbour);
        }
      }
    }

    return visited.size === adjacency.size;
  }

  /* ------------------------------------------------------------------ *
   * Connectivity
   * ------------------------------------------------------------------ */

  /** Vertex sets of the connected components of the one-skeleton, in input order. */
  function connectedComponents(complex) {
    const indexed = complex.vertexIndex ? complex : indexComplex(complex);
    const adjacency = indexed.vertices.map(() => []);

    for (const edge of indexed.edges) {
      const source = indexed.vertexIndex.get(edge.source);
      const target = indexed.vertexIndex.get(edge.target);
      adjacency[source].push(target);
      adjacency[target].push(source);
    }

    const visited = new Array(indexed.vertices.length).fill(false);
    const components = [];

    for (let start = 0; start < indexed.vertices.length; start += 1) {
      if (visited[start]) {
        continue;
      }
      const component = [];
      const queue = [start];
      visited[start] = true;

      while (queue.length > 0) {
        const current = queue.pop();
        component.push(current);
        for (const neighbour of adjacency[current]) {
          if (!visited[neighbour]) {
            visited[neighbour] = true;
            queue.push(neighbour);
          }
        }
      }

      component.sort((left, right) => left - right);
      components.push(component.map((index) => indexed.vertices[index].id));
    }

    return components;
  }

  /**
   * Find a perfect matching of the requested vertices using any subset of the
   * complex's edges. Unused and parallel edges are harmless. Pass
   * options.allowedEdgeIds to restrict which edges may carry a pair.
   */
  function findPerfectMatching(complex, vertexIds, options = {}) {
    if (vertexIds.length === 0) {
      return [];
    }
    const allowed = options.allowedEdgeIds ? new Set(options.allowedEdgeIds) : null;
    const [first, ...rest] = vertexIds;
    for (let index = 0; index < rest.length; index += 1) {
      const second = rest[index];
      const edge = (complex.edges ?? []).find(
        (candidate) =>
          (!allowed || allowed.has(candidate.id)) &&
          ((candidate.source === first && candidate.target === second) ||
            (candidate.source === second && candidate.target === first)),
      );
      if (!edge) {
        continue;
      }
      const remainder = rest.filter((_, itemIndex) => itemIndex !== index);
      const matching = findPerfectMatching(complex, remainder, options);
      if (matching) {
        return [{ first, second, edgeId: edge.id }, ...matching];
      }
    }
    return null;
  }

  /**
   * Give every requirement { id, vertexIds, allowedEdgeIds? } a perfect matching
   * of its vertices, or return null if some requirement has none.
   *
   * Requirements may share edges. A merged Z-check commutes with the X-check at
   * vertex v because [v in supp(z)] + deg(v) in its own matching is even, which
   * involves no other check, so one ancilla edge is free to serve several checks.
   */
  function findMatchingAssignments(complex, requirements) {
    const assignments = {};
    for (const requirement of requirements) {
      const matching = findPerfectMatching(complex, requirement.vertexIds, requirement);
      if (!matching) {
        return null;
      }
      assignments[requirement.id] = matching;
    }
    return assignments;
  }

  /* ------------------------------------------------------------------ *
   * Betti numbers
   * ------------------------------------------------------------------ */

  function bettiNumbers(complex, faceReports) {
    const indexed = complex.vertexIndex ? complex : indexComplex(complex);
    const reports = faceReports ?? indexed.faces.map((face) => validateFace(face, indexed));
    const columns1 = boundary1Columns(indexed);
    const columns2 = boundary2Columns(indexed, reports);
    const rankBoundary1 = gf2Rank(columns1);
    const elimination2 = gf2Eliminate(columns2.columns);
    const rankBoundary2 = elimination2.rank;

    return {
      beta0: indexed.vertices.length - rankBoundary1,
      beta1: indexed.edges.length - rankBoundary1 - rankBoundary2,
      beta2: columns2.columns.length - rankBoundary2,
      rankBoundary1,
      rankBoundary2,
      closedFaceIds: columns2.faceIds,
      faceColumns: columns2.columns,
      faceDependencies: elimination2.dependencies,
    };
  }

  /* ------------------------------------------------------------------ *
   * Witnesses
   * ------------------------------------------------------------------ */

  /**
   * A cycle of the one-skeleton that is not in the image of d2, i.e. a hole no
   * combination of faces can fill. Fundamental cycles of a spanning forest span the
   * cycle space, so it is enough to reduce those modulo the face boundaries; the
   * shortest surviving one is returned for readable feedback.
   */
  function findCycleWitness(indexed, faceColumns) {
    const basis = gf2Basis(faceColumns);
    const adjacency = indexed.vertices.map(() => []);

    indexed.edges.forEach((edge, edgeIdx) => {
      const source = indexed.vertexIndex.get(edge.source);
      const target = indexed.vertexIndex.get(edge.target);
      adjacency[source].push({ edgeIdx, other: target });
      adjacency[target].push({ edgeIdx, other: source });
    });

    const visited = new Array(indexed.vertices.length).fill(false);
    const pathToRoot = new Array(indexed.vertices.length).fill(0n);
    const treeEdges = new Set();
    const candidates = [];

    for (let root = 0; root < indexed.vertices.length; root += 1) {
      if (visited[root]) {
        continue;
      }
      visited[root] = true;
      const queue = [root];

      while (queue.length > 0) {
        const current = queue.shift();
        for (const { edgeIdx, other } of adjacency[current]) {
          if (visited[other]) {
            continue;
          }
          visited[other] = true;
          treeEdges.add(edgeIdx);
          pathToRoot[other] = pathToRoot[current] ^ gf2Bit(edgeIdx);
          queue.push(other);
        }
      }
    }

    indexed.edges.forEach((edge, edgeIdx) => {
      if (treeEdges.has(edgeIdx)) {
        return;
      }
      const source = indexed.vertexIndex.get(edge.source);
      const target = indexed.vertexIndex.get(edge.target);
      const cycle = pathToRoot[source] ^ pathToRoot[target] ^ gf2Bit(edgeIdx);
      candidates.push({ edgeIdx, cycle, weight: gf2Weight(cycle) });
    });

    candidates.sort((left, right) => left.weight - right.weight || left.edgeIdx - right.edgeIdx);

    for (const candidate of candidates) {
      if (gf2Reduce(candidate.cycle, basis) !== 0n) {
        const edgeIds = gf2Indices(candidate.cycle).map((index) => indexed.edges[index].id);
        const vertexIds = [];
        const seen = new Set();
        for (const index of gf2Indices(candidate.cycle)) {
          for (const vertexId of [indexed.edges[index].source, indexed.edges[index].target]) {
            if (!seen.has(vertexId)) {
              seen.add(vertexId);
              vertexIds.push(vertexId);
            }
          }
        }
        return { edgeIds, vertexIds, length: edgeIds.length };
      }
    }

    return null;
  }

  /** Faces whose boundaries sum to zero, i.e. a nonzero element of ker d2. */
  function findRedundantFaceWitness(homology) {
    const dependency = homology.faceDependencies[0];
    if (!dependency) {
      return null;
    }
    return {
      faceIds: gf2Indices(dependency.combination).map((index) => homology.closedFaceIds[index]),
    };
  }

  /* ------------------------------------------------------------------ *
   * Metrics
   * ------------------------------------------------------------------ */

  /**
   * LDPC-style load metrics. Parallel edges count separately, a self-loop counts
   * twice towards its vertex degree, and edge congestion counts each face at most
   * once per edge.
   */
  function computeMetrics(indexed, faceReports) {
    const vertexDegrees = new Map(indexed.vertices.map((vertex) => [vertex.id, 0]));
    const edgeCongestion = new Map(indexed.edges.map((edge) => [edge.id, 0]));
    const faceWeights = new Map();

    for (const edge of indexed.edges) {
      vertexDegrees.set(edge.source, vertexDegrees.get(edge.source) + 1);
      vertexDegrees.set(edge.target, vertexDegrees.get(edge.target) + 1);
    }

    indexed.faces.forEach((face, index) => {
      const report = faceReports[index];
      faceWeights.set(face.id, report.weight);
      for (const edgeId of new Set(face.boundaryEdgeIds ?? [])) {
        if (edgeCongestion.has(edgeId)) {
          edgeCongestion.set(edgeId, edgeCongestion.get(edgeId) + 1);
        }
      }
    });

    return {
      vertexDegrees,
      faceWeights,
      edgeCongestion,
      maxVertexDegree: maxValue(vertexDegrees),
      maxFaceWeight: maxValue(faceWeights),
      maxFacesPerEdge: maxValue(edgeCongestion),
    };
  }

  function maxValue(counts) {
    let largest = 0;
    for (const value of counts.values()) {
      if (value > largest) {
        largest = value;
      }
    }
    return largest;
  }

  function toObject(counts) {
    const result = {};
    for (const [key, value] of counts) {
      result[key] = value;
    }
    return result;
  }

  /* ------------------------------------------------------------------ *
   * Top-level analysis
   * ------------------------------------------------------------------ */

  const FACE_REASON_TEXT = {
    emptyBoundary: "has no boundary edges",
    unknownBoundaryEdge: "references an edge that does not exist",
    repeatedBoundaryEdge: "lists the same edge more than once",
    selfLoopInBoundary: "uses a self-loop",
    boundaryNotClosed: "is not closed, some vertex meets an odd number of boundary edges",
    vertexUsedMoreThanTwice: "revisits a vertex, so it is not a simple cycle",
    disconnectedBoundary: "is a union of separate cycles rather than one cycle",
  };

  function describeFace(report) {
    return report.reasons.map((reason) => FACE_REASON_TEXT[reason] ?? reason).join("; ");
  }

  const DEFECT_TEXT = {
    duplicateVertexId: "Duplicate vertex ID",
    duplicateEdgeId: "Duplicate edge ID",
    duplicateFaceId: "Duplicate face ID",
    unknownEdgeEndpoint: "Edge refers to a vertex that does not exist",
  };

  function resolveCap(caps, ...names) {
    for (const name of names) {
      const value = caps[name];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
    }
    return UNLIMITED;
  }

  /**
   * Validate a complex and report every defect.
   *
   * A complex is valid when every face is one simple cycle, the one-skeleton is
   * connected (beta0 = 1), every cycle is filled (beta1 = 0), no face is redundant
   * (beta2 = 0), and all load caps hold.
   *
   * Issues come back in a fixed order so that the first one is always the most
   * useful thing to say: malformed face, extra component, unfilled cycle, overload.
   * Redundant faces and structural defects follow.
   */
  function analyzeComplex(complex, caps = {}) {
    const indexed = indexComplex(complex ?? {});
    const faceReports = indexed.faces.map((face) => validateFace(face, indexed));
    const homology = bettiNumbers(indexed, faceReports);
    const load = computeMetrics(indexed, faceReports);
    const components = connectedComponents(indexed);

    const vertexDegreeCap = resolveCap(caps, "maxVertexDegree");
    const faceWeightCap = resolveCap(caps, "maxFaceWeight");
    const edgeCongestionCap = resolveCap(caps, "maxFacesPerEdge", "maxEdgeFaceCongestion");

    const issues = [];
    const witnesses = {
      malformedFaces: [],
      extraComponents: [],
      unfilledCycle: null,
      overloads: { vertices: [], faces: [], edges: [] },
      redundantFaces: null,
      structuralDefects: [],
    };

    // 1. Malformed faces.
    for (const report of faceReports) {
      if (report.valid) {
        continue;
      }
      witnesses.malformedFaces.push(report);
      issues.push({
        code: "MALFORMED_FACE",
        severity: "error",
        message: `Face ${report.faceId} ${describeFace(report)}.`,
        faceId: report.faceId,
        edgeIds: report.edgeIds,
        vertexIds: report.oddVertexIds.length > 0 ? report.oddVertexIds : report.vertexIds,
        reasons: report.reasons,
      });
    }

    // 2. Extra components: everything must live in one connected piece.
    if (indexed.vertices.length === 0) {
      issues.push({
        code: "EMPTY_COMPLEX",
        severity: "error",
        message: "The complex has no vertices, so it cannot be a connected cone.",
      });
    } else if (components.length > 1) {
      witnesses.extraComponents = components.slice(1);
      for (const component of witnesses.extraComponents) {
        issues.push({
          code: "DISCONNECTED_COMPONENT",
          severity: "error",
          message: `${component.length} vertex or vertices form a component separate from the main body.`,
          vertexIds: component,
        });
      }
    }

    // 3. Unfilled cycles: a hole no combination of faces can fill.
    if (homology.beta1 > 0) {
      witnesses.unfilledCycle = findCycleWitness(indexed, homology.faceColumns);
      issues.push({
        code: "NONTRIVIAL_H1",
        severity: "error",
        message:
          witnesses.unfilledCycle === null
            ? `There are ${homology.beta1} unfilled cycle or cycles.`
            : `Cycle ${witnesses.unfilledCycle.edgeIds.join(" + ")} is not the boundary of any combination of faces.`,
        betti: homology.beta1,
        edgeIds: witnesses.unfilledCycle?.edgeIds ?? [],
        vertexIds: witnesses.unfilledCycle?.vertexIds ?? [],
      });
    }

    // 4. Overloads.
    for (const [vertexId, degree] of load.vertexDegrees) {
      if (degree > vertexDegreeCap) {
        witnesses.overloads.vertices.push({ vertexId, degree, cap: vertexDegreeCap });
        issues.push({
          code: "OVERLOADED_VERTEX",
          severity: "error",
          message: `Vertex ${vertexId} has degree ${degree}, above the limit of ${vertexDegreeCap}.`,
          vertexId,
          value: degree,
          cap: vertexDegreeCap,
        });
      }
    }

    for (const [faceId, weight] of load.faceWeights) {
      if (weight > faceWeightCap) {
        witnesses.overloads.faces.push({ faceId, weight, cap: faceWeightCap });
        issues.push({
          code: "OVERLOADED_FACE",
          severity: "error",
          message: `Face ${faceId} has weight ${weight}, above the limit of ${faceWeightCap}.`,
          faceId,
          value: weight,
          cap: faceWeightCap,
        });
      }
    }

    for (const [edgeId, faceCount] of load.edgeCongestion) {
      if (faceCount > edgeCongestionCap) {
        witnesses.overloads.edges.push({ edgeId, faceCount, cap: edgeCongestionCap });
        issues.push({
          code: "CONGESTED_EDGE",
          severity: "error",
          message: `Edge ${edgeId} carries ${faceCount} faces, above the limit of ${edgeCongestionCap}.`,
          edgeId,
          value: faceCount,
          cap: edgeCongestionCap,
        });
      }
    }

    // 5. Redundant faces, then structural defects.
    if (homology.beta2 > 0) {
      witnesses.redundantFaces = findRedundantFaceWitness(homology);
      issues.push({
        code: "NONTRIVIAL_H2",
        severity: "error",
        message:
          witnesses.redundantFaces === null
            ? `There are ${homology.beta2} redundant face relation or relations.`
            : `Faces ${witnesses.redundantFaces.faceIds.join(" + ")} have boundaries that cancel, so one of them is redundant.`,
        betti: homology.beta2,
        faceIds: witnesses.redundantFaces?.faceIds ?? [],
      });
    }

    for (const defect of indexed.defects) {
      witnesses.structuralDefects.push(defect);
      issues.push({
        code: "STRUCTURAL_DEFECT",
        severity: "error",
        message: `${DEFECT_TEXT[defect.kind] ?? defect.kind}: ${defect.id}.`,
        kind: defect.kind,
        id: defect.id,
      });
    }

    const metrics = {
      vertexCount: indexed.vertices.length,
      edgeCount: indexed.edges.length,
      faceCount: indexed.faces.length,
      closedFaceCount: homology.closedFaceIds.length,
      componentCount: components.length,
      beta0: homology.beta0,
      beta1: homology.beta1,
      beta2: homology.beta2,
      rankBoundary1: homology.rankBoundary1,
      rankBoundary2: homology.rankBoundary2,
      maxVertexDegree: load.maxVertexDegree,
      maxFaceWeight: load.maxFaceWeight,
      maxFacesPerEdge: load.maxFacesPerEdge,
      vertexDegrees: toObject(load.vertexDegrees),
      faceWeights: toObject(load.faceWeights),
      edgeCongestion: toObject(load.edgeCongestion),
      components,
    };

    return { metrics, valid: issues.length === 0, issues, witnesses };
  }

  const api = {
    UNLIMITED,
    gf2Bit,
    gf2FromIndices,
    gf2Indices,
    gf2Weight,
    gf2LeadingIndex,
    gf2Eliminate,
    gf2Rank,
    gf2Rref,
    gf2Basis,
    gf2Reduce,
    gf2InSpan,
    indexComplex,
    boundary1Columns,
    boundary2Columns,
    faceBoundaryVector,
    validateFace,
    connectedComponents,
    findPerfectMatching,
    findMatchingAssignments,
    bettiNumbers,
    computeMetrics,
    findCycleWitness,
    findRedundantFaceWitness,
    analyzeComplex,
  };

  if (typeof module === "object" && module !== null && typeof module.exports === "object") {
    module.exports = api;
  }
  if (typeof window !== "undefined") {
    window.AncillaHomology = api;
  }
})();
