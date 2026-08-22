const SVG_NS = "http://www.w3.org/2000/svg";

const canvas = document.querySelector("#graph-canvas");
const background = document.querySelector("#canvas-background");
const edgesLayer = document.querySelector("#edges-layer");
const pairArcsLayer = document.querySelector("#pair-arcs-layer");
const nodesLayer = document.querySelector("#nodes-layer");
const pairTokensLayer = document.querySelector("#pair-tokens-layer");
const statsElement = document.querySelector("#graph-stats");
const messageElement = document.querySelector("#mode-message");
const connectButton = document.querySelector("#connect-button");
const deleteButton = document.querySelector("#delete-button");
const conflictSummary = document.querySelector("#conflict-summary");
const conflictChips = document.querySelector("#conflict-chips");
const challengeResult = document.querySelector("#challenge-result");
const algebraLedger = document.querySelector("#algebra-ledger");
const degreeXElement = document.querySelector("#degree-x");
const degreeZElement = document.querySelector("#degree-z");
const degreeDataElement = document.querySelector("#degree-data");
const addedDataCountElement = document.querySelector("#added-data-count");
const levelSelect = document.querySelector("#level-select");
const graphName = document.querySelector("#graph-name");
const targetOperator = document.querySelector("#target-operator");
const challengeDescription = document.querySelector("#challenge-description");
const challengeLedger = {
  commutation: document.querySelector("#ledger-commutation"),
  stabilizer: document.querySelector("#ledger-stabilizer"),
  dimension: document.querySelector("#ledger-dimension"),
};

function createSteaneGraph() {
  const nodes = [
    { id: "d1", type: "data", label: "q1", x: 500, y: 85, initial: true },
    { id: "d2", type: "data", label: "q2", x: 500, y: 170, initial: true },
    { id: "d3", type: "data", label: "q3", x: 500, y: 255, initial: true },
    { id: "d4", type: "data", label: "q4", x: 500, y: 340, initial: true },
    { id: "d5", type: "data", label: "q5", x: 500, y: 425, initial: true },
    { id: "d6", type: "data", label: "q6", x: 500, y: 510, initial: true },
    { id: "d7", type: "data", label: "q7", x: 500, y: 595, initial: true },
    { id: "x1", type: "x", label: "X1", x: 205, y: 175, initial: true },
    { id: "x2", type: "x", label: "X2", x: 205, y: 340, initial: true },
    { id: "x3", type: "x", label: "X3", x: 205, y: 505, initial: true },
    { id: "z1", type: "z", label: "Z1", x: 795, y: 175, initial: true },
    { id: "z2", type: "z", label: "Z2", x: 795, y: 340, initial: true },
    { id: "z3", type: "z", label: "Z3", x: 795, y: 505, initial: true },
  ];

  // H_X = H_Z with supports 1234, 1256, and 1357.
  const supports = [
    ["1", ["d1", "d2", "d3", "d4"]],
    ["2", ["d1", "d2", "d5", "d6"]],
    ["3", ["d1", "d3", "d5", "d7"]],
  ];
  const edges = [];

  for (const [checkIndex, dataIds] of supports) {
    for (const dataId of dataIds) {
      edges.push({
        id: `ex${checkIndex}-${dataId}`,
        source: `x${checkIndex}`,
        target: dataId,
        initial: true,
      });
      edges.push({
        id: `ez${checkIndex}-${dataId}`,
        source: `z${checkIndex}`,
        target: dataId,
        initial: true,
      });
    }
  }

  return { nodes, edges };
}

function createHgpGraphFrom(h1, h2, layout = {}) {
  const rowCount1 = h1.length;
  const columnCount1 = h1[0].length;
  const rowCount2 = h2.length;
  const columnCount2 = h2[0].length;
  const originX = layout.originX ?? 400;
  const originY = layout.originY ?? 90;
  const gap = layout.gap ?? 72;
  const checkGap = layout.checkGap ?? 118;
  const xOffset = layout.xOffset ?? 300;
  const zOffset = layout.zOffset ?? 70;
  const nodes = [];
  const edges = [];
  let dataNumber = 1;

  for (let first = 0; first < columnCount1; first += 1) {
    for (let second = 0; second < columnCount2; second += 1) {
      nodes.push({
        id: `a-${first}-${second}`,
        type: "data",
        label: `q${dataNumber++}`,
        x: originX + second * gap,
        y: originY + first * gap,
        initial: true,
      });
    }
  }

  const blockY = originY + columnCount1 * gap + 56;
  for (let first = 0; first < rowCount1; first += 1) {
    for (let second = 0; second < rowCount2; second += 1) {
      nodes.push({
        id: `b-${first}-${second}`,
        type: "data",
        label: `q${dataNumber++}`,
        x: originX + 24 + second * gap,
        y: blockY + first * gap,
        initial: true,
      });
    }
  }

  // H_X = [H1 tensor I_n2 | I_r1 tensor H2^T], rows indexed by C1 x V2.
  for (let check = 0; check < rowCount1; check += 1) {
    for (let vertex = 0; vertex < columnCount2; vertex += 1) {
      const id = `hx-${check}-${vertex}`;
      nodes.push({
        id,
        type: "x",
        label: `X${check * columnCount2 + vertex + 1}`,
        x: originX - xOffset + check * checkGap,
        y: originY + vertex * Math.max(gap, (columnCount1 * gap) / columnCount2),
        initial: true,
      });
      for (let first = 0; first < columnCount1; first += 1) {
        if (h1[check][first]) {
          edges.push({
            id: `${id}-a-${first}-${vertex}`,
            source: id,
            target: `a-${first}-${vertex}`,
            initial: true,
          });
        }
      }
      for (let second = 0; second < rowCount2; second += 1) {
        if (h2[second][vertex]) {
          edges.push({
            id: `${id}-b-${check}-${second}`,
            source: id,
            target: `b-${check}-${second}`,
            initial: true,
          });
        }
      }
    }
  }

  // H_Z = [I_n1 tensor H2 | H1^T tensor I_r2], rows indexed by V1 x C2.
  for (let vertex = 0; vertex < columnCount1; vertex += 1) {
    for (let check = 0; check < rowCount2; check += 1) {
      const id = `hz-${vertex}-${check}`;
      nodes.push({
        id,
        type: "z",
        label: `Z${vertex * rowCount2 + check + 1}`,
        x: originX + columnCount2 * gap + zOffset + check * checkGap,
        y: originY + vertex * gap,
        initial: true,
      });
      for (let second = 0; second < columnCount2; second += 1) {
        if (h2[check][second]) {
          edges.push({
            id: `${id}-a-${vertex}-${second}`,
            source: id,
            target: `a-${vertex}-${second}`,
            initial: true,
          });
        }
      }
      for (let first = 0; first < rowCount1; first += 1) {
        if (h1[first][vertex]) {
          edges.push({
            id: `${id}-b-${first}-${check}`,
            source: id,
            target: `b-${first}-${check}`,
            initial: true,
          });
        }
      }
    }
  }

  return { nodes, edges };
}

function createHgpGraph() {
  return createHgpGraphFrom(
    [
      [1, 1, 0],
      [0, 1, 1],
    ],
    [
      [1, 1, 0],
      [0, 1, 1],
    ],
    { originX: 420, originY: 105, gap: 80 },
  );
}

function createHgp20Graph() {
  // Hypergraph product of H with itself, H the [4,2,2] check matrix.
  return createHgpGraphFrom(
    [
      [1, 1, 1, 0],
      [0, 1, 1, 1],
    ],
    [
      [1, 1, 1, 0],
      [0, 1, 1, 1],
    ],
    { originX: 390, originY: 70, gap: 66 },
  );
}

function createHgp27Graph() {
  // Hypergraph product of the [3,1,3] repetition code with the [7,4,3] Hamming code.
  return createHgpGraphFrom(
    [
      [1, 1, 0],
      [0, 1, 1],
    ],
    [
      [1, 0, 1, 0, 1, 0, 1],
      [0, 1, 1, 0, 0, 1, 1],
      [0, 0, 0, 1, 1, 1, 1],
    ],
    { originX: 360, originY: 70, gap: 58 },
  );
}

function createHgp41Graph() {
  // Hypergraph product of the [5,1,5] repetition code with itself.
  return createHgpGraphFrom(
    [
      [1, 1, 0, 0, 0],
      [0, 1, 1, 0, 0],
      [0, 0, 1, 1, 0],
      [0, 0, 0, 1, 1],
    ],
    [
      [1, 1, 0, 0, 0],
      [0, 1, 1, 0, 0],
      [0, 0, 1, 1, 0],
      [0, 0, 0, 1, 1],
    ],
    { originX: 520, originY: 55, gap: 52, xOffset: 430, checkGap: 90, zOffset: 80 },
  );
}

function createHgp100Graph() {
  // Square product of a [8,2,5] classical code, written in a sparse parity
  // basis so every qubit stays low degree. The last check ties the three
  // otherwise separate chains together, keeping the Tanner graph connected.
  const shortened825 = [
    [1, 1, 0, 0, 0, 0, 0, 0],
    [0, 1, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 1, 1, 0, 0, 0],
    [0, 0, 0, 0, 0, 1, 1, 0],
    [0, 0, 0, 0, 0, 0, 1, 1],
    [1, 0, 0, 1, 0, 1, 0, 0],
  ];
  return createHgpGraphFrom(shortened825, shortened825, {
    originX: 640,
    originY: 45,
    gap: 46,
    xOffset: 560,
    checkGap: 86,
    zOffset: 90,
  });
}

const LEVELS = {
  steane: {
    name: "Steane [[7,1,3]] code",
    targetIds: new Set(["d2", "d4", "d6"]),
    originalK: 1,
    createGraph: createSteaneGraph,
    description:
      "Make the highlighted logical operator an X stabilizer while removing exactly one logical qubit.",
  },
  hgp: {
    name: "Repetition-product HGP [[13,1,3]] code",
    targetIds: new Set(["a-0-0", "a-0-1", "a-0-2"]),
    originalK: 1,
    createGraph: createHgpGraph,
    description:
      "Measure a row-like X logical of the hypergraph-product code while preserving CSS commutation.",
  },
  hgp20: {
    name: "Even-weight HGP [[20,4,2]] code",
    targetIds: new Set(["a-0-1", "a-0-2"]),
    originalK: 4,
    createGraph: createHgp20Graph,
    description:
      "Measure one weight-2 X logical of this k=4 hypergraph-product code, leaving three logical qubits.",
  },
  hgp27: {
    name: "Hamming-repetition HGP [[27,4,3]] code",
    targetIds: new Set(["a-0-0", "a-0-1", "a-0-2"]),
    originalK: 4,
    createGraph: createHgp27Graph,
    description:
      "Measure one weight-3 X logical of this distance-3 hypergraph-product code, leaving three logical qubits.",
  },
  hgp41: {
    name: "Repetition-product HGP [[41,1,5]] code",
    targetIds: new Set(["a-0-0", "a-0-1", "a-0-2", "a-0-3", "a-0-4"]),
    originalK: 1,
    createGraph: createHgp41Graph,
    description:
      "Measure the weight-5 X logical of this distance-5 hypergraph-product code, leaving no logical qubits.",
  },
  hgp100: {
    name: "Square [8,2,5] HGP [[100,4,5]] code",
    targetIds: new Set(["a-0-0", "a-0-1", "a-0-2", "a-0-3", "a-0-4"]),
    originalK: 4,
    createGraph: createHgp100Graph,
    description:
      "Measure one weight-5 X logical of this connected k=4, distance-5 code, leaving three logical qubits.",
  },
};

let currentLevelId = "steane";
let currentLevel = LEVELS[currentLevelId];

function createInitialGraph() {
  return currentLevel.createGraph();
}

let graph = createInitialGraph();
let selection = null;
let connectMode = false;
let connectSource = null;
let drag = null;
let pan = null;
let view = { x: 0, y: 0, width: 1000, height: 680 };
let inspectedPairId = null;
let nextNodeNumber = 1;
let nextEdgeNumber = 1;

function getNode(id) {
  return graph.nodes.find((node) => node.id === id);
}

function getEdge(id) {
  return graph.edges.find((edge) => edge.id === id);
}

function getSelectedItem() {
  if (!selection) return null;
  return selection.kind === "node" ? getNode(selection.id) : getEdge(selection.id);
}

function edgeEndpoints(edge) {
  const source = getNode(edge.source);
  const target = getNode(edge.target);
  if (!source || !target) return null;
  if (source.type === "data" && target.type !== "data") return { data: source, check: target };
  if (target.type === "data" && source.type !== "data") return { data: target, check: source };
  return null;
}

function checkSupports() {
  const supports = new Map();
  for (const node of graph.nodes) {
    if (node.type !== "data") supports.set(node.id, new Set());
  }
  for (const edge of graph.edges) {
    const ends = edgeEndpoints(edge);
    if (ends) supports.get(ends.check.id)?.add(ends.data.id);
  }
  return supports;
}

function computeLdpcProfile() {
  const supports = checkSupports();
  const dataDegrees = new Map(
    graph.nodes
      .filter((node) => node.type === "data")
      .map((node) => [node.id, 0]),
  );

  for (const edge of graph.edges) {
    const ends = edgeEndpoints(edge);
    if (ends) dataDegrees.set(ends.data.id, (dataDegrees.get(ends.data.id) ?? 0) + 1);
  }

  const maxForType = (type) =>
    Math.max(
      0,
      ...graph.nodes
        .filter((node) => node.type === type)
        .map((node) => supports.get(node.id)?.size ?? 0),
    );

  return {
    maxX: maxForType("x"),
    maxZ: maxForType("z"),
    maxData: Math.max(0, ...dataDegrees.values()),
    addedData: graph.nodes.filter((node) => node.type === "data" && !node.initial).length,
  };
}

const distanceCache = new Map();
const distanceRequests = new Set();

function gf2Rref(rows, columnCount) {
  const matrix = rows.map((row) => row.slice(0, columnCount));
  const pivots = [];
  let rank = 0;

  for (let column = 0; column < columnCount && rank < matrix.length; column += 1) {
    const pivot = matrix.findIndex((row, index) => index >= rank && row[column] === 1);
    if (pivot === -1) continue;

    [matrix[rank], matrix[pivot]] = [matrix[pivot], matrix[rank]];
    for (let row = 0; row < matrix.length; row += 1) {
      if (row === rank || matrix[row][column] === 0) continue;
      for (let entry = column; entry < columnCount; entry += 1) {
        matrix[row][entry] ^= matrix[rank][entry];
      }
    }
    pivots.push(column);
    rank += 1;
  }

  return { matrix, rank, pivots };
}

function gf2Rank(rows) {
  if (rows.length === 0) return 0;
  return gf2Rref(rows, rows[0].length).rank;
}

function decodeDistance(value) {
  return value === "inf" ? Infinity : Number(value);
}

async function requestIlpDistance(key, xRows, zRows) {
  if (distanceRequests.has(key) || distanceCache.has(key)) return;
  distanceRequests.add(key);
  try {
    const response = await fetch("/api/distance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hx: xRows, hz: zRows }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Distance solver failed");
    distanceCache.set(key, {
      distanceX: decodeDistance(result.dx),
      distanceZ: decodeDistance(result.dz),
    });
  } catch (error) {
    console.error("ILP distance calculation failed:", error);
    distanceCache.set(key, { distanceX: null, distanceZ: null });
  } finally {
    distanceRequests.delete(key);
    render();
  }
}

function formatDistance(value) {
  if (value === null) return "?";
  if (!Number.isFinite(value)) return "inf";
  return String(value);
}

function computeCodeState(conflicts) {
  const dataNodes = graph.nodes.filter((node) => node.type === "data");
  const dataIndex = new Map(dataNodes.map((node, index) => [node.id, index]));
  const supports = checkSupports();

  const rowForCheck = (check) => {
    const row = Array(dataNodes.length).fill(0);
    for (const dataId of supports.get(check.id) ?? []) {
      const index = dataIndex.get(dataId);
      if (index !== undefined) row[index] = 1;
    }
    return row;
  };

  const xRows = graph.nodes.filter((node) => node.type === "x").map(rowForCheck);
  const zRows = graph.nodes.filter((node) => node.type === "z").map(rowForCheck);
  const target = dataNodes.map((node) => Number(currentLevel.targetIds.has(node.id)));
  const rankX = gf2Rank(xRows);
  const rankZ = gf2Rank(zRows);
  const commuting = conflicts.length === 0;
  const targetInXSpan = gf2Rank([...xRows, target]) === rankX;
  const rawK = dataNodes.length - rankX - rankZ;
  const targetK = currentLevel.originalK - 1;
  const dimensionCorrect = commuting && rawK === targetK;
  const cacheKey = commuting
    ? `${dataNodes.length}:${xRows.map((row) => row.join("")).join("/")}:${zRows.map((row) => row.join("")).join("/")}`
    : "";
  let distanceX = null;
  let distanceZ = null;
  if (commuting && rawK === 0) {
    distanceX = Infinity;
    distanceZ = Infinity;
  } else if (commuting) {
    const cached = distanceCache.get(cacheKey);
    if (cached) {
      distanceX = cached.distanceX;
      distanceZ = cached.distanceZ;
    } else {
      requestIlpDistance(cacheKey, xRows, zRows);
    }
  }
  const distance =
    distanceX === null || distanceZ === null
      ? null
      : Math.min(distanceX, distanceZ);

  return {
    n: dataNodes.length,
    rankX,
    rankZ,
    rawK,
    commuting,
    targetInXSpan,
    dimensionCorrect,
    complete: commuting && targetInXSpan && dimensionCorrect,
    distanceX,
    distanceZ,
    distance,
  };
}

// X(a) and Z(b) anticommute exactly when they share an odd number of data qubits.
function computeConflicts() {
  const supports = checkSupports();
  const order = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const pairs = [];

  for (const x of graph.nodes.filter((node) => node.type === "x")) {
    for (const z of graph.nodes.filter((node) => node.type === "z")) {
      const zSupport = supports.get(z.id);
      const shared = [...supports.get(x.id)]
        .filter((dataId) => zSupport.has(dataId))
        .sort((a, b) => order.get(a) - order.get(b));
      if (shared.length % 2 === 1) {
        pairs.push({ id: `${x.id}|${z.id}`, xId: x.id, zId: z.id, shared });
      }
    }
  }
  return pairs;
}

function makeSvgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }
  return element;
}

function renderLevelHeader() {
  graphName.textContent = currentLevel.name;
  challengeDescription.textContent = currentLevel.description;
  targetOperator.textContent = graph.nodes
    .filter((node) => currentLevel.targetIds.has(node.id))
    .map((node) => `X(${node.label})`)
    .join(" ");
}

function render() {
  renderLevelHeader();
  edgesLayer.replaceChildren();
  pairArcsLayer.replaceChildren();
  nodesLayer.replaceChildren();
  pairTokensLayer.replaceChildren();

  const conflicts = computeConflicts();
  const codeState = computeCodeState(conflicts);
  const ldpcProfile = computeLdpcProfile();
  const conflictCheckIds = new Set(conflicts.flatMap((pair) => [pair.xId, pair.zId]));
  const inspected = conflicts.find((pair) => pair.id === inspectedPairId) ?? null;
  if (!inspected) inspectedPairId = null;

  const sharedIds = new Set(inspected ? inspected.shared : []);
  const focusNodeIds = inspected ? new Set([inspected.xId, inspected.zId, ...sharedIds]) : new Set();

  for (const edge of graph.edges) {
    const source = getNode(edge.source);
    const target = getNode(edge.target);
    if (!source || !target) continue;

    const ends = edgeEndpoints(edge);
    const isOverlapEdge = Boolean(
      inspected &&
        ends &&
        sharedIds.has(ends.data.id) &&
        (ends.check.id === inspected.xId || ends.check.id === inspected.zId),
    );

    const line = makeSvgElement("line", {
      x1: source.x,
      y1: source.y,
      x2: target.x,
      y2: target.y,
      class: [
        "edge",
        edge.initial ? "initial" : "added",
        isOverlapEdge ? "overlap" : "",
        selection?.kind === "edge" && selection.id === edge.id ? "selected" : "",
      ].join(" "),
      "data-id": edge.id,
      tabindex: "0",
      "aria-label": `${edge.initial ? "Original" : "Added"} edge from ${source.label} to ${target.label}`,
    });
    line.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      selection = { kind: "edge", id: edge.id };
      connectSource = null;
      inspectedPairId = null;
      setMessage(
        edge.initial
          ? `Selected original edge ${source.label}-${target.label} (locked)`
          : `Selected added edge ${source.label}-${target.label}`,
      );
      render();
    });
    edgesLayer.append(line);
  }

  for (const node of graph.nodes) {
    const isSelected = selection?.kind === "node" && selection.id === node.id;
    const isConnectSource = connectSource === node.id;
    const inConflict = conflictCheckIds.has(node.id);
    const isFocused = focusNodeIds.has(node.id);
    const isTarget = currentLevel.targetIds.has(node.id);
    const group = makeSvgElement("g", {
      class: [
        "node",
        node.type,
        node.initial ? "initial" : "added",
        isTarget ? "targeted" : "",
        isTarget && codeState.targetInXSpan ? "target-measured" : "",
        inConflict ? "conflicted" : "",
        isFocused ? "focused" : "",
        isSelected ? "selected" : "",
        isConnectSource ? "connect-source" : "",
        drag?.id === node.id ? "dragging" : "",
      ].join(" "),
      transform: `translate(${node.x} ${node.y})`,
      "data-id": node.id,
      tabindex: "0",
      role: "button",
      "aria-label": `${node.initial ? "Original" : "Added"} ${typeName(node.type).toLowerCase()} ${node.label}`,
    });

    const shape =
      node.type === "data"
        ? makeSvgElement("circle", { r: 25, class: "node-shape" })
        : makeSvgElement("rect", {
            x: -25,
            y: -25,
            width: 50,
            height: 50,
            rx: 7,
            class: "node-shape",
          });
    const symbol = makeSvgElement("text", { y: 1, class: "node-label" });
    symbol.textContent = node.type === "data" ? node.label.replace("q", "") : node.type.toUpperCase();
    const name = makeSvgElement("text", { y: 43, class: "node-name" });
    name.textContent = node.label;

    if (isTarget) {
      group.append(makeSvgElement("circle", { r: 34, class: "target-ring" }));
    }

    if (inConflict || isFocused) {
      const ringClass = `conflict-ring ${isFocused ? "strong" : ""}`;
      const ring =
        node.type === "data"
          ? makeSvgElement("circle", { r: 34, class: ringClass })
          : makeSvgElement("rect", {
              x: -34,
              y: -34,
              width: 68,
              height: 68,
              rx: 11,
              class: ringClass,
            });
      group.append(ring);
    }

    group.append(shape, symbol, name);
    group.addEventListener("pointerdown", (event) => beginNodeInteraction(event, node));
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleNodeClick(node);
      }
    });
    nodesLayer.append(group);
  }

  conflicts.forEach((pair, index) => {
    const x = getNode(pair.xId);
    const z = getNode(pair.zId);
    if (!x || !z) return;

    const midX = (x.x + z.x) / 2;
    const midY = (x.y + z.y) / 2;
    const length = Math.hypot(z.x - x.x, z.y - x.y) || 1;
    const side = index % 2 === 0 ? 1 : -1;
    const offset = (70 + 34 * Math.floor(index / 2)) * side;
    const normalX = (-(z.y - x.y) / length) * offset;
    const normalY = ((z.x - x.x) / length) * offset;
    const isActive = inspected?.id === pair.id;

    const arc = makeSvgElement("path", {
      d: `M ${x.x} ${x.y} Q ${midX + normalX * 2} ${midY + normalY * 2} ${z.x} ${z.y}`,
      class: `pair-arc ${isActive ? "active" : ""}`,
    });
    pairArcsLayer.append(arc);

    const token = makeSvgElement("g", {
      class: `pair-token ${isActive ? "active" : ""}`,
      transform: `translate(${midX + normalX} ${midY + normalY})`,
      tabindex: "0",
      role: "button",
      "aria-label": `${x.label} anticommutes with ${z.label} on ${qubitCount(pair.shared.length)}`,
    });
    token.append(
      makeSvgElement("circle", { r: 15, class: "pair-token-shape" }),
      makeSvgElement("text", { y: 1, class: "pair-token-label" }),
    );
    token.querySelector(".pair-token-label").textContent = String(pair.shared.length);

    const activate = (event) => {
      event.preventDefault();
      event.stopPropagation();
      inspectPair(pair.id);
    };
    token.addEventListener("pointerdown", activate);
    token.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") activate(event);
    });
    pairTokensLayer.append(token);
  });

  renderConflictBar(conflicts, inspected);
  renderChallenge(codeState);
  degreeXElement.textContent = `max deg X = ${ldpcProfile.maxX}`;
  degreeZElement.textContent = `max deg Z = ${ldpcProfile.maxZ}`;
  degreeDataElement.textContent = `max deg data = ${ldpcProfile.maxData}`;
  addedDataCountElement.textContent = `added data = ${ldpcProfile.addedData}`;
  canvas.classList.toggle("inspecting", Boolean(inspected));
  canvas.classList.toggle("challenge-complete", codeState.complete);

  const dataCount = graph.nodes.filter((node) => node.type === "data").length;
  const xCount = graph.nodes.filter((node) => node.type === "x").length;
  const zCount = graph.nodes.filter((node) => node.type === "z").length;
  const addedNodes = graph.nodes.filter((node) => !node.initial).length;
  const addedEdges = graph.edges.filter((edge) => !edge.initial).length;
  statsElement.textContent =
    `${dataCount} data | ${xCount} X checks | ${zCount} Z checks | ${graph.edges.length} edges` +
    ` | added: ${addedNodes} nodes, ${addedEdges} edges`;
  connectButton.classList.toggle("active", connectMode);

  const selected = getSelectedItem();
  deleteButton.disabled = !selected || selected.initial === true;
}

function setLedgerState(element, passed) {
  element.classList.toggle("passed", passed);
  element.classList.toggle("pending", !passed);
}

function renderChallenge(state) {
  setLedgerState(challengeLedger.commutation, state.commuting);
  setLedgerState(challengeLedger.stabilizer, state.targetInXSpan);
  setLedgerState(challengeLedger.dimension, state.dimensionCorrect);

  challengeResult.textContent = state.complete ? "Measurement gadget complete" : "Gadget incomplete";
  challengeResult.classList.toggle("complete", state.complete);

  const kValue = state.commuting ? state.rawK : "invalid";
  const distanceText = state.commuting
    ? `dX=${formatDistance(state.distanceX)} | dZ=${formatDistance(state.distanceZ)} | d=${formatDistance(state.distance)}`
    : "d=invalid";
  algebraLedger.textContent =
    `n=${state.n} | rank(HX)=${state.rankX} | rank(HZ)=${state.rankZ} | k=${kValue} | ${distanceText}`;
}

function qubitCount(count) {
  return count === 1 ? "1 qubit" : `${count} qubits`;
}

function renderConflictBar(conflicts, inspected) {
  conflictChips.replaceChildren();

  if (conflicts.length === 0) {
    conflictSummary.textContent = "All stabilizers commute";
    conflictSummary.classList.remove("has-conflicts");
    return;
  }

  conflictSummary.textContent =
    conflicts.length === 1 ? "1 anticommuting pair" : `${conflicts.length} anticommuting pairs`;
  conflictSummary.classList.add("has-conflicts");

  for (const pair of conflicts) {
    const x = getNode(pair.xId);
    const z = getNode(pair.zId);
    if (!x || !z) continue;

    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `conflict-chip ${inspected?.id === pair.id ? "active" : ""}`;
    chip.textContent = `${x.label} / ${z.label} (${pair.shared.length})`;
    chip.addEventListener("click", () => inspectPair(pair.id));
    conflictChips.append(chip);
  }
}

function inspectPair(pairId) {
  if (inspectedPairId === pairId) {
    inspectedPairId = null;
    setMessage("Cleared the anticommuting pair view");
    render();
    return;
  }

  const pair = computeConflicts().find((item) => item.id === pairId);
  if (!pair) return;

  inspectedPairId = pairId;
  selection = null;
  connectSource = null;

  const x = getNode(pair.xId);
  const z = getNode(pair.zId);
  const labels = pair.shared.map((id) => getNode(id)?.label ?? id).join(", ");
  setMessage(`${x.label} and ${z.label} anticommute on ${qubitCount(pair.shared.length)}: ${labels}`);
  render();
}

function typeName(type) {
  if (type === "data") return "Data qubit";
  return `${type.toUpperCase()} check`;
}

function setMessage(message) {
  messageElement.textContent = message;
}

function svgCoordinates(event) {
  const point = canvas.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(canvas.getScreenCTM().inverse());
}

function applyView() {
  canvas.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
  // The grid only tiles where the background rect is, so it has to track the viewport.
  background.setAttribute("x", view.x);
  background.setAttribute("y", view.y);
  background.setAttribute("width", view.width);
  background.setAttribute("height", view.height);
}

function fitView() {
  if (graph.nodes.length === 0) {
    view = { x: 0, y: 0, width: 1000, height: 680 };
    applyView();
    return;
  }

  const xs = graph.nodes.map((node) => node.x);
  const ys = graph.nodes.map((node) => node.y);
  const padding = 90;
  const minX = Math.min(...xs) - padding;
  const minY = Math.min(...ys) - padding;
  const width = Math.max(Math.max(...xs) + padding - minX, 320);
  const height = Math.max(Math.max(...ys) + padding - minY, 240);

  view = { x: minX, y: minY, width, height };
  applyView();
}

function beginNodeInteraction(event, node) {
  event.preventDefault();
  event.stopPropagation();
  const point = svgCoordinates(event);
  drag = {
    id: node.id,
    pointerId: event.pointerId,
    offsetX: point.x - node.x,
    offsetY: point.y - node.y,
    startX: point.x,
    startY: point.y,
    moved: false,
  };
}

window.addEventListener("pointermove", (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const point = svgCoordinates(event);
  if (Math.hypot(point.x - drag.startX, point.y - drag.startY) > 4) {
    drag.moved = true;
  }
  if (!drag.moved) return;

  const node = getNode(drag.id);
  if (!node) return;
  node.x = point.x - drag.offsetX;
  node.y = point.y - drag.offsetY;
  render();
});

window.addEventListener("pointermove", (event) => {
  if (!pan || event.pointerId !== pan.pointerId) return;
  view.x = pan.startViewX - (event.clientX - pan.startClientX) * pan.scaleX;
  view.y = pan.startViewY - (event.clientY - pan.startClientY) * pan.scaleY;
  applyView();
});

window.addEventListener("pointerup", (event) => {
  if (pan && event.pointerId === pan.pointerId) pan = null;
});

window.addEventListener("pointerup", (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const node = getNode(drag.id);
  const wasMoved = drag.moved;
  drag = null;
  if (!wasMoved && node) handleNodeClick(node);
  else {
    setMessage(node ? `Moved ${node.label}` : "Node moved");
    render();
  }
});

function handleNodeClick(node) {
  if (!connectMode) {
    selection = { kind: "node", id: node.id };
    inspectedPairId = null;
    setMessage(node.initial ? `Selected ${node.label} (original, locked)` : `Selected ${node.label}`);
    render();
    return;
  }

  if (!connectSource) {
    connectSource = node.id;
    selection = { kind: "node", id: node.id };
    setMessage(`Connect from ${node.label}: choose a data/check node`);
    render();
    return;
  }

  if (connectSource === node.id) {
    connectSource = null;
    setMessage("Connection cancelled: choose the first node");
    render();
    return;
  }

  const source = getNode(connectSource);
  if (!source) return;
  if (!isValidTannerPair(source, node)) {
    setMessage("An edge must connect one data qubit to one X or Z check");
    return;
  }
  if (hasEdge(source.id, node.id)) {
    setMessage(`${source.label} and ${node.label} are already connected`);
    return;
  }

  graph.edges.push({
    id: `new-edge-${nextEdgeNumber++}`,
    source: source.id,
    target: node.id,
    initial: false,
  });
  connectSource = null;
  selection = null;
  setMessage(`Added edge ${source.label}-${node.label}`);
  render();
}

function isValidTannerPair(first, second) {
  return (first.type === "data") !== (second.type === "data");
}

function hasEdge(firstId, secondId) {
  return graph.edges.some(
    (edge) =>
      (edge.source === firstId && edge.target === secondId) ||
      (edge.source === secondId && edge.target === firstId),
  );
}

function addNode(type) {
  const sameTypeCount = graph.nodes.filter((node) => node.type === type).length;
  const prefix = type === "data" ? "q" : type.toUpperCase();
  const spread = ((sameTypeCount * 53) % 300) - 150;
  const id = `new-node-${nextNodeNumber++}`;
  const centerX = view.x + view.width / 2;
  const centerY = view.y + view.height / 2;
  const column = type === "x" ? -view.width * 0.17 : type === "z" ? view.width * 0.17 : 0;

  graph.nodes.push({
    id,
    type,
    label: `${prefix}${sameTypeCount + 1}`,
    x: centerX + column + (type === "data" ? spread : 0),
    y: centerY + (type === "data" ? 0 : spread),
    initial: false,
  });
  selection = { kind: "node", id };
  setMessage(`Added ${typeName(type).toLowerCase()}`);
  render();
}

function deleteSelection() {
  if (!selection) {
    setMessage("Select a node or edge to delete");
    return;
  }

  const selected = getSelectedItem();
  if (!selected) {
    selection = null;
    render();
    return;
  }
  if (selected.initial) {
    setMessage(
      selection.kind === "edge"
        ? "Original code edges are locked and cannot be deleted"
        : `${selected.label} belongs to the original code and cannot be deleted`,
    );
    return;
  }

  if (selection.kind === "edge") {
    graph.edges = graph.edges.filter((edge) => edge.id !== selection.id);
    setMessage("Deleted edge");
  } else {
    const node = getNode(selection.id);
    graph.nodes = graph.nodes.filter((item) => item.id !== selection.id);
    graph.edges = graph.edges.filter(
      (edge) => edge.source !== selection.id && edge.target !== selection.id,
    );
    if (connectSource === selection.id) connectSource = null;
    setMessage(node ? `Deleted ${node.label} and its edges` : "Deleted node");
  }
  selection = null;
  render();
}

document.querySelectorAll("[data-add-node]").forEach((button) => {
  button.addEventListener("click", () => addNode(button.dataset.addNode));
});

function resetCurrentLevel(message) {
  graph = createInitialGraph();
  selection = null;
  connectSource = null;
  connectMode = false;
  inspectedPairId = null;
  nextNodeNumber = 1;
  nextEdgeNumber = 1;
  view = { x: 0, y: 0, width: 1000, height: 680 };
  applyView();
  setMessage(message);
  render();
  fitView();
}

levelSelect.addEventListener("change", () => {
  currentLevelId = levelSelect.value;
  currentLevel = LEVELS[currentLevelId];
  resetCurrentLevel(`Loaded ${currentLevel.name}`);
});

connectButton.addEventListener("click", () => {
  connectMode = !connectMode;
  connectSource = null;
  selection = null;
  setMessage(connectMode ? "Add edge: choose the first node" : "Select or drag a node");
  render();
});

document.querySelector("#delete-button").addEventListener("click", deleteSelection);

document.querySelector("#reset-button").addEventListener("click", () => {
  resetCurrentLevel(`Restored the initial ${currentLevel.name}`);
});

document.querySelector("#fit-button").addEventListener("click", () => {
  fitView();
  setMessage("Fitted the view to the whole graph");
});

document.querySelector("#clear-added-button").addEventListener("click", () => {
  const addedNodeIds = new Set(
    graph.nodes.filter((node) => !node.initial).map((node) => node.id),
  );
  graph.nodes = graph.nodes.filter((node) => node.initial);
  graph.edges = graph.edges.filter(
    (edge) =>
      edge.initial && !addedNodeIds.has(edge.source) && !addedNodeIds.has(edge.target),
  );
  selection = null;
  connectSource = null;
  setMessage("Removed all added nodes and edges");
  render();
});

canvas.addEventListener("pointerdown", (event) => {
  if (
    event.target.closest(".node") ||
    event.target.closest(".edge") ||
    event.target.closest(".pair-token")
  ) {
    return;
  }
  selection = null;
  connectSource = null;
  inspectedPairId = null;

  const ctm = canvas.getScreenCTM();
  if (ctm) {
    pan = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startViewX: view.x,
      startViewY: view.y,
      scaleX: 1 / ctm.a,
      scaleY: 1 / ctm.d,
    };
  }

  setMessage(connectMode ? "Add edge: choose the first node" : "Select or drag a node");
  render();
});

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const cursor = svgCoordinates(event);
    const factor = Math.exp(event.deltaY * 0.0015);
    const width = Math.min(Math.max(view.width * factor, 240), 24000);
    const ratio = width / view.width;

    view = {
      x: cursor.x - (cursor.x - view.x) * ratio,
      y: cursor.y - (cursor.y - view.y) * ratio,
      width,
      height: view.height * ratio,
    };
    applyView();
  },
  { passive: false },
);

window.addEventListener("keydown", (event) => {
  const activeTag = document.activeElement?.tagName;
  if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;

  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    deleteSelection();
  }
  if (event.key === "Escape") {
    selection = null;
    connectSource = null;
    connectMode = false;
    inspectedPairId = null;
    setMessage("Select or drag a node");
    render();
  }
});

applyView();
levelSelect.value = currentLevelId;
render();
