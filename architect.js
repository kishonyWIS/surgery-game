const SVG_NS = "http://www.w3.org/2000/svg";
const Homology = window.AncillaHomology;
const RandomChallenge = window.AncillaRandomChallenge;

const levelSelect = document.querySelector("#architect-level-select");
const canvas = document.querySelector("#architect-canvas");
const background = document.querySelector("#architect-background");
const faceLayer = document.querySelector("#architect-face-layer");
const edgeLayer = document.querySelector("#architect-edge-layer");
const nodeLayer = document.querySelector("#architect-node-layer");
const nameElement = document.querySelector("#architect-name");
const titleElement = document.querySelector("#architect-title");
const descriptionElement = document.querySelector("#architect-description");
const statsElement = document.querySelector("#architect-stats");
const messageElement = document.querySelector("#architect-message");
const resultElement = document.querySelector("#architect-result");
const ledgerElement = document.querySelector("#architect-ledger");
const attackBar = document.querySelector("#attack-bar");
const addVertexButton = document.querySelector("#add-vertex-button");
const addEdgeButton = document.querySelector("#add-edge-button");
const addFaceButton = document.querySelector("#add-face-button");
const deleteButton = document.querySelector("#architect-delete-button");
const pairingPanel = document.querySelector("#pairing-panel");
const pairingControls = document.querySelector("#pairing-controls");

const meterElements = {
  edges: document.querySelector("#meter-edges"),
  beta0: document.querySelector("#meter-b0"),
  beta1: document.querySelector("#meter-b1"),
  beta2: document.querySelector("#meter-b2"),
  degree: document.querySelector("#meter-degree"),
  face: document.querySelector("#meter-face"),
  congestion: document.querySelector("#meter-congestion"),
};

let challenge = null;
let complex = { vertices: [], edges: [], faces: [] };
let selection = null;
let mode = "select";
let connectSource = null;
let faceDraft = [];
let drag = null;
let pan = null;
let view = { x: 0, y: 0, width: 1000, height: 680 };
let nextVertexNumber = 1;
let nextEdgeNumber = 1;
let nextFaceNumber = 1;
let witness = null;
let loadToken = 0;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeSvgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function getVertex(id) {
  return complex.vertices.find((vertex) => vertex.id === id);
}

function getEdge(id) {
  return complex.edges.find((edge) => edge.id === id);
}

function getFace(id) {
  return complex.faces.find((face) => face.id === id);
}

function selectedItem() {
  if (!selection) return null;
  if (selection.kind === "vertex") return getVertex(selection.id);
  if (selection.kind === "edge") return getEdge(selection.id);
  return getFace(selection.id);
}

function setMessage(message) {
  messageElement.textContent = message;
}

function resetAttackBar() {
  attackBar.textContent = "Press Attack to test the current filling.";
  attackBar.classList.remove("success", "failure");
}

function setMode(nextMode, message) {
  mode = nextMode;
  connectSource = null;
  if (nextMode !== "face") faceDraft = [];
  selection = null;
  witness = null;
  if (message) setMessage(message);
  render();
}

function initializeForcedPairingEdges() {
  if (!challenge?.zChecks) return;
  complex.edges = complex.edges.filter(
    (edge) => edge.type !== "measurement_required" || !edge.checkId,
  );

  for (const check of challenge.zChecks) {
    const overlap = check.support.filter((vertexId) => challenge.logicalX.includes(vertexId));
    if (overlap.length === 2) {
      complex.edges.push({
        id: `pair-${check.id}-0`,
        source: overlap[0],
        target: overlap[1],
        type: "measurement_required",
        checkId: check.id,
        initial: true,
      });
    }
  }
}

function editablePairingChecks() {
  return (challenge?.zChecks ?? [])
    .map((check) => ({
      ...check,
      overlap: check.support.filter((vertexId) => challenge.logicalX.includes(vertexId)),
    }))
    .filter((check) => check.overlap.length >= 4);
}

function pairingRequirements() {
  return (challenge?.zChecks ?? [])
    .map((check) => ({
      ...check,
      overlap: check.support.filter((vertexId) => challenge.logicalX.includes(vertexId)),
    }))
    .filter((check) => check.overlap.length >= 2 && check.overlap.length % 2 === 0)
    .map((check) => ({ id: check.id, vertexIds: check.overlap }));
}

function zCheckMatchingAssignments() {
  return Homology?.findMatchingAssignments(complex, pairingRequirements()) ?? null;
}

function renderPairingControls() {
  pairingControls.replaceChildren();
  const editableChecks = editablePairingChecks();
  pairingPanel.hidden = editableChecks.length === 0;
  const assignments = zCheckMatchingAssignments();

  for (const check of editableChecks) {
    const wrapper = document.createElement("div");
    wrapper.className = "pairing-control";
    const heading = document.createElement("strong");
    heading.textContent = `${check.label ?? check.id}: {${check.overlap.join(", ")}}`;
    const matching = assignments?.[check.id] ?? null;
    const status = document.createElement("span");
    status.className = `pairing-status ${matching ? "complete" : "incomplete"}`;
    status.textContent = matching
      ? `Matched by ${matching.map(({ first, second }) => `${first}–${second}`).join(", ")}`
      : "No perfect matching yet";
    wrapper.append(heading, status);
    pairingControls.append(wrapper);
  }
}

function normalizeInitialCells() {
  complex.vertices.forEach((vertex) => {
    vertex.initial = true;
  });
  complex.edges.forEach((edge) => {
    edge.initial = edge.type === "measurement_required";
  });
  complex.faces.forEach((face) => {
    face.initial = true;
  });
}

async function loadChallenge(id) {
  const token = ++loadToken;
  setMessage("Loading challenge…");
  try {
    let loaded;
    if (id === "random") {
      const seedValues = new Uint32Array(1);
      crypto.getRandomValues(seedValues);
      loaded = RandomChallenge.generateRandomChallenge(seedValues[0]);
    } else {
      const response = await fetch(`challenges/${id}.json`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      loaded = await response.json();
    }
    if (token !== loadToken) return;
    challenge = loaded;
    complex = {
      vertices: clone(loaded.vertices ?? []),
      edges: clone(loaded.edges ?? []),
      faces: clone(loaded.faces ?? []),
    };
    normalizeInitialCells();
    if (challenge.zChecks) initializeForcedPairingEdges();
    resetInteraction();
    resetAttackBar();
    renderPairingControls();
    applyView();
    render();
    fitView();
    setMessage(`Loaded ${challenge.name}`);
  } catch (error) {
    nameElement.textContent = "Challenge failed to load";
    setMessage(id === "random" ? "Could not generate a random challenge" : `Could not load challenges/${id}.json`);
    console.error(error);
  }
}

function resetInteraction() {
  selection = null;
  mode = "select";
  connectSource = null;
  faceDraft = [];
  witness = null;
  nextVertexNumber = 1;
  nextEdgeNumber = 1;
  nextFaceNumber = 1;
  view = { x: 0, y: 0, width: 1000, height: 680 };
}

function reportMetrics(report) {
  return report.metrics ?? report;
}

function analyze() {
  if (!Homology) {
    return {
      valid: false,
      metrics: {
        beta0: "?",
        beta1: "?",
        beta2: "?",
        maxVertexDegree: "?",
        maxFaceWeight: "?",
        maxFacesPerEdge: "?",
      },
      issues: [{ type: "engine", message: "Homology engine did not load" }],
    };
  }
  const report = Homology.analyzeComplex(complex, challenge?.caps ?? {});
  const pairingChecks = editablePairingChecks();
  if (pairingChecks.length === 0 || zCheckMatchingAssignments()) return report;

  const overlapVertexIds = [...new Set(pairingChecks.flatMap((check) => check.overlap))];
  const pairingIssue = {
    code: "INCOMPLETE_PAIRING",
    severity: "error",
    message: "Some Z-check overlap has no perfect matching among the current edges.",
    vertexIds: overlapVertexIds,
  };
  return {
    ...report,
    valid: false,
    issues: [pairingIssue, ...report.issues],
  };
}

function issueText(issue) {
  if (!issue) return "No obstruction found.";
  if (issue.message) return issue.message;
  const labels = {
    malformed_face: "A selected face is not the boundary of one cycle.",
    disconnected: "The complex has more than one connected component.",
    unfilled_cycle: "A cycle remains outside the span of the face boundaries.",
    overload: "An LDPC cap is exceeded.",
    beta2: "The faces contain a redundant closed 2-cycle.",
  };
  return labels[issue.type] ?? "The current filling is invalid.";
}

function renderMeters(report) {
  const metrics = reportMetrics(report);
  const caps = challenge?.caps ?? {};
  meterElements.edges.textContent = `|E| = ${complex.edges.length}`;
  meterElements.beta0.textContent = `β₀ = ${metrics.beta0}`;
  meterElements.beta1.textContent = `β₁ = ${metrics.beta1}`;
  meterElements.beta2.textContent = `β₂ = ${metrics.beta2}`;
  meterElements.degree.textContent = `deg = ${metrics.maxVertexDegree}/${caps.maxVertexDegree ?? "∞"}`;
  meterElements.face.textContent = `face = ${metrics.maxFaceWeight}/${caps.maxFaceWeight ?? "∞"}`;
  meterElements.congestion.textContent =
    `congestion = ${metrics.maxFacesPerEdge}/${caps.maxFacesPerEdge ?? "∞"}`;

  meterElements.beta0.classList.toggle("over-cap", metrics.beta0 !== 1);
  meterElements.beta1.classList.toggle("over-cap", metrics.beta1 !== 0);
  meterElements.beta2.classList.toggle("over-cap", metrics.beta2 !== 0);
  meterElements.degree.classList.toggle(
    "over-cap",
    Number.isFinite(caps.maxVertexDegree) && metrics.maxVertexDegree > caps.maxVertexDegree,
  );
  meterElements.face.classList.toggle(
    "over-cap",
    Number.isFinite(caps.maxFaceWeight) && metrics.maxFaceWeight > caps.maxFaceWeight,
  );
  meterElements.congestion.classList.toggle(
    "over-cap",
    Number.isFinite(caps.maxFacesPerEdge) &&
      metrics.maxFacesPerEdge > caps.maxFacesPerEdge,
  );

  resultElement.textContent = report.valid ? "Valid LDPC filling" : "Complex incomplete";
  resultElement.classList.toggle("complete", report.valid);
  const score = report.valid
    ? `score = (${complex.edges.length}, ${complex.vertices.filter((v) => v.type === "auxiliary").length}, ${complex.faces.length})`
    : "score unlocks when β₀=1, β₁=β₂=0 and every cap passes";
  ledgerElement.textContent =
    `rank(∂₁)=${metrics.rankBoundary1 ?? "?"} | rank(∂₂)=${metrics.rankBoundary2 ?? "?"} | ${score}`;
}

function edgePath(edge, parallelIndex = 0, parallelCount = 1) {
  const source = getVertex(edge.source);
  const target = getVertex(edge.target);
  if (!source || !target) return "";
  if (parallelCount === 1) return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.hypot(dx, dy) || 1;
  const offset = (parallelIndex - (parallelCount - 1) / 2) * 28;
  const midpointX = (source.x + target.x) / 2 - (dy / length) * offset;
  const midpointY = (source.y + target.y) / 2 + (dx / length) * offset;
  return `M ${source.x} ${source.y} Q ${midpointX} ${midpointY} ${target.x} ${target.y}`;
}

function parallelInfo(edge) {
  const same = complex.edges.filter(
    (candidate) =>
      (candidate.source === edge.source && candidate.target === edge.target) ||
      (candidate.source === edge.target && candidate.target === edge.source),
  );
  return { index: same.findIndex((candidate) => candidate.id === edge.id), count: same.length };
}

function witnessSets() {
  const issue = witness;
  return {
    vertices: new Set(
      issue?.vertexIds ?? issue?.vertices ?? (issue?.vertexId ? [issue.vertexId] : []),
    ),
    edges: new Set(issue?.edgeIds ?? issue?.edges ?? (issue?.edgeId ? [issue.edgeId] : [])),
    faces: new Set(issue?.faceIds ?? (issue?.faceId ? [issue.faceId] : [])),
  };
}

function render() {
  if (!challenge) return;
  const report = analyze();
  renderMeters(report);
  nameElement.textContent = challenge.name;
  titleElement.textContent = challenge.title;
  descriptionElement.textContent = challenge.description;
  statsElement.textContent =
    `${complex.vertices.length} vertices | ${complex.edges.length} ancilla qubits | ${complex.faces.length} Z-faces`;
  faceLayer.replaceChildren();
  edgeLayer.replaceChildren();
  nodeLayer.replaceChildren();
  const highlighted = witnessSets();
  const largeOverlapVertexIds = new Set(
    editablePairingChecks().flatMap((check) => check.overlap),
  );

  for (const face of complex.faces) {
    const selected = selection?.kind === "face" && selection.id === face.id;
    const isWitness = highlighted.faces.has(face.id);
    for (const edgeId of face.boundaryEdgeIds) {
      const edge = getEdge(edgeId);
      if (!edge) continue;
      const info = parallelInfo(edge);
      faceLayer.append(
        makeSvgElement("path", {
          d: edgePath(edge, info.index, info.count),
          class: `architect-face-trace ${selected || isWitness ? "selected" : ""}`,
        }),
      );
    }
    const positions = face.boundaryEdgeIds
      .map(getEdge)
      .filter(Boolean)
      .flatMap((edge) => [getVertex(edge.source), getVertex(edge.target)])
      .filter(Boolean);
    if (positions.length) {
      const label = makeSvgElement("text", {
        x: positions.reduce((sum, vertex) => sum + vertex.x, 0) / positions.length,
        y: positions.reduce((sum, vertex) => sum + vertex.y, 0) / positions.length - 8,
        class: "architect-face-label",
      });
      label.textContent = face.id;
      label.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        selection = { kind: "face", id: face.id };
        witness = null;
        setMessage(`Selected ${face.id}`);
        render();
      });
      faceLayer.append(label);
    }
  }

  for (const edge of complex.edges) {
    const info = parallelInfo(edge);
    const path = makeSvgElement("path", {
      d: edgePath(edge, info.index, info.count),
      class: [
        "architect-edge",
        edge.type.replace("_", "-"),
        selection?.kind === "edge" && selection.id === edge.id ? "selected" : "",
        faceDraft.includes(edge.id) ? "face-pick" : "",
        highlighted.edges.has(edge.id) ? "witness" : "",
      ].join(" "),
      tabindex: "0",
      role: "button",
      "aria-label": `${edge.type.replaceAll("_", " ")} edge ${edge.id}`,
    });
    const selectEdge = (event) => {
      event.preventDefault();
      event.stopPropagation();
      handleEdgeClick(edge);
    };
    path.addEventListener("pointerdown", selectEdge);
    path.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") selectEdge(event);
    });
    edgeLayer.append(path);
  }

  for (const vertex of complex.vertices) {
    const isPairingMember = largeOverlapVertexIds.has(vertex.id);
    const group = makeSvgElement("g", {
      class: [
        "architect-node",
        vertex.type,
        isPairingMember ? "pairing-member" : "",
        selection?.kind === "vertex" && selection.id === vertex.id ? "selected" : "",
        connectSource === vertex.id ? "connect-source" : "",
        highlighted.vertices.has(vertex.id) ? "witness" : "",
        drag?.id === vertex.id ? "dragging" : "",
      ].join(" "),
      transform: `translate(${vertex.x} ${vertex.y})`,
      tabindex: "0",
      role: "button",
      "aria-label": `${vertex.type} vertex ${vertex.label ?? vertex.id}`,
    });
    const shape =
      vertex.type === "measurement"
        ? makeSvgElement("circle", { r: 25, class: "architect-node-shape" })
        : makeSvgElement("rect", {
            x: -24,
            y: -24,
            width: 48,
            height: 48,
            rx: 9,
            class: "architect-node-shape",
          });
    const label = makeSvgElement("text", { y: 1, class: "architect-node-label" });
    label.textContent = vertex.label ?? vertex.id;
    if (isPairingMember) {
      group.append(
        makeSvgElement("circle", {
          r: 34,
          class: "pairing-overlap-ring",
        }),
      );
    }
    group.append(shape, label);
    group.addEventListener("pointerdown", (event) => beginVertexInteraction(event, vertex));
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") handleVertexClick(vertex);
    });
    nodeLayer.append(group);
  }

  addEdgeButton.classList.toggle("active", mode === "edge");
  addFaceButton.classList.toggle("active", mode === "face");
  addFaceButton.textContent = mode === "face" && faceDraft.length
    ? `Discard boundary (${faceDraft.length})`
    : "Face from edges";
  const item = selectedItem();
  deleteButton.disabled =
    !item ||
    (selection.kind === "vertex" && item.type === "measurement") ||
    (selection.kind === "edge" && item.type === "measurement_required") ||
    item.initial === true;
  renderPairingControls();
}

function handleEdgeClick(edge) {
  witness = null;
  if (mode === "face") {
    const index = faceDraft.indexOf(edge.id);
    if (index >= 0) faceDraft.splice(index, 1);
    else faceDraft.push(edge.id);
    if (draftIsClosedCycle()) {
      commitFace();
      return;
    }
    setMessage(
      faceDraft.length
        ? `${faceDraft.length} boundary edges selected; the face closes itself on the last one`
        : "Choose the boundary edges for the new face",
    );
  } else {
    selection = { kind: "edge", id: edge.id };
    setMessage(
      edge.type === "measurement_required"
        ? `Selected ${edge.id} (required and locked)`
        : `Selected ${edge.id}`,
    );
  }
  render();
}

function handleVertexClick(vertex) {
  witness = null;
  if (mode !== "edge") {
    selection = { kind: "vertex", id: vertex.id };
    setMessage(
      vertex.type === "measurement"
        ? `Selected ${vertex.label} (logical support, locked)`
        : `Selected ${vertex.label}`,
    );
    render();
    return;
  }

  if (!connectSource) {
    connectSource = vertex.id;
    selection = { kind: "vertex", id: vertex.id };
    setMessage(`Connect from ${vertex.label}; choose the other endpoint`);
    render();
    return;
  }
  if (connectSource === vertex.id) {
    connectSource = null;
    setMessage("Choose the first endpoint");
    render();
    return;
  }

  const source = getVertex(connectSource);
  const edge = {
    id: `e${nextEdgeNumber++}`,
    source: source.id,
    target: vertex.id,
    type: "edge",
    initial: false,
  };
  complex.edges.push(edge);
  connectSource = null;
  selection = { kind: "edge", id: edge.id };
  resetAttackBar();
  setMessage(`Added edge ${edge.id}`);
  render();
}

// A draft becomes a face the moment it is one connected simple cycle, which is the
// same condition the engine uses to accept a boundary.
function draftIsClosedCycle() {
  if (!Homology || faceDraft.length === 0) return false;
  const indexed = Homology.indexComplex(complex);
  return Homology.validateFace({ id: "draft", boundaryEdgeIds: faceDraft }, indexed).valid;
}

function commitFace() {
  const face = {
    id: `f${nextFaceNumber++}`,
    boundaryEdgeIds: [...faceDraft],
    initial: false,
  };
  complex.faces.push(face);
  faceDraft = [];
  selection = { kind: "face", id: face.id };
  setMessage(`Closed ${face.id} on ${face.boundaryEdgeIds.length} edges; start the next boundary`);
  render();
}

function toggleFaceTool() {
  if (mode !== "face") {
    setMode("face", "Click the edges of a cycle; the face closes as soon as the loop shuts");
    return;
  }
  if (faceDraft.length > 0) {
    faceDraft = [];
    setMessage("Discarded the boundary in progress");
    render();
    return;
  }
  setMode("select", "Face tool off");
}

function addAuxVertex() {
  const id = `v${nextVertexNumber++}`;
  const vertex = {
    id,
    label: id,
    type: "auxiliary",
    x: view.x + view.width / 2 + ((nextVertexNumber * 47) % 180) - 90,
    y: view.y + view.height / 2 + ((nextVertexNumber * 71) % 160) - 80,
    initial: false,
  };
  complex.vertices.push(vertex);
  mode = "select";
  selection = { kind: "vertex", id };
  witness = null;
  setMessage(`Added auxiliary vertex ${id}`);
  render();
}

function deleteSelection() {
  const item = selectedItem();
  if (!item) return;
  if (
    item.initial ||
    (selection.kind === "vertex" && item.type === "measurement") ||
    (selection.kind === "edge" && item.type === "measurement_required")
  ) {
    setMessage("Required measurement cells are locked");
    return;
  }
  if (selection.kind === "face") {
    complex.faces = complex.faces.filter((face) => face.id !== item.id);
  } else if (selection.kind === "edge") {
    complex.edges = complex.edges.filter((edge) => edge.id !== item.id);
    complex.faces = complex.faces.filter((face) => !face.boundaryEdgeIds.includes(item.id));
  } else {
    const edgeIds = new Set(
      complex.edges
        .filter((edge) => edge.source === item.id || edge.target === item.id)
        .map((edge) => edge.id),
    );
    complex.vertices = complex.vertices.filter((vertex) => vertex.id !== item.id);
    complex.edges = complex.edges.filter((edge) => !edgeIds.has(edge.id));
    complex.faces = complex.faces.filter(
      (face) => !face.boundaryEdgeIds.some((edgeId) => edgeIds.has(edgeId)),
    );
  }
  setMessage(`Deleted ${item.id} and dependent cells`);
  selection = null;
  witness = null;
  render();
}

function clearAdditions() {
  const addedVertexIds = new Set(
    complex.vertices.filter((vertex) => !vertex.initial).map((vertex) => vertex.id),
  );
  complex.vertices = complex.vertices.filter((vertex) => vertex.initial);
  complex.edges = complex.edges.filter(
    (edge) =>
      edge.initial &&
      !addedVertexIds.has(edge.source) &&
      !addedVertexIds.has(edge.target),
  );
  complex.faces = complex.faces.filter((face) => face.initial);
  if (challenge.zChecks) initializeForcedPairingEdges();
  resetInteraction();
  resetAttackBar();
  setMessage("Removed all player cells");
  render();
}

function attack() {
  const report = analyze();
  witness = report.issues?.[0] ?? null;
  attackBar.classList.toggle("success", report.valid);
  attackBar.classList.toggle("failure", !report.valid);
  if (report.valid) {
    const auxiliaries = complex.vertices.filter((vertex) => vertex.type === "auxiliary").length;
    attackBar.textContent =
      `No obstruction found. Valid score: (${complex.edges.length}, ${auxiliaries}, ${complex.faces.length}).`;
  } else {
    attackBar.textContent = `Attack found: ${issueText(witness)}`;
  }
  selection = null;
  render();
}

function svgCoordinates(event) {
  const point = canvas.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(canvas.getScreenCTM().inverse());
}

function beginVertexInteraction(event, vertex) {
  event.preventDefault();
  event.stopPropagation();
  const point = svgCoordinates(event);
  drag = {
    id: vertex.id,
    pointerId: event.pointerId,
    offsetX: point.x - vertex.x,
    offsetY: point.y - vertex.y,
    startX: point.x,
    startY: point.y,
    moved: false,
  };
}

function applyView() {
  canvas.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
  background.setAttribute("x", view.x);
  background.setAttribute("y", view.y);
  background.setAttribute("width", view.width);
  background.setAttribute("height", view.height);
}

function fitView() {
  if (complex.vertices.length === 0) return;
  const xs = complex.vertices.map((vertex) => vertex.x);
  const ys = complex.vertices.map((vertex) => vertex.y);
  const padding = 100;
  const minX = Math.min(...xs) - padding;
  const minY = Math.min(...ys) - padding;
  view = {
    x: minX,
    y: minY,
    width: Math.max(Math.max(...xs) + padding - minX, 360),
    height: Math.max(Math.max(...ys) + padding - minY, 280),
  };
  applyView();
}

window.addEventListener("pointermove", (event) => {
  if (drag && event.pointerId === drag.pointerId) {
    const point = svgCoordinates(event);
    if (Math.hypot(point.x - drag.startX, point.y - drag.startY) > 4) drag.moved = true;
    if (drag.moved) {
      const vertex = getVertex(drag.id);
      if (vertex) {
        vertex.x = point.x - drag.offsetX;
        vertex.y = point.y - drag.offsetY;
        render();
      }
    }
  }
  if (pan && event.pointerId === pan.pointerId) {
    view.x = pan.startViewX - (event.clientX - pan.startClientX) * pan.scaleX;
    view.y = pan.startViewY - (event.clientY - pan.startClientY) * pan.scaleY;
    applyView();
  }
});

window.addEventListener("pointerup", (event) => {
  if (pan?.pointerId === event.pointerId) pan = null;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const vertex = getVertex(drag.id);
  const moved = drag.moved;
  drag = null;
  if (!moved && vertex) handleVertexClick(vertex);
  else render();
});

canvas.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".architect-node") || event.target.closest(".architect-edge")) return;
  selection = null;
  connectSource = null;
  witness = null;
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

addVertexButton.addEventListener("click", addAuxVertex);
addEdgeButton.addEventListener("click", () =>
  setMode(mode === "edge" ? "select" : "edge", "Choose two endpoints for an edge"),
);
addFaceButton.addEventListener("click", toggleFaceTool);
deleteButton.addEventListener("click", deleteSelection);
document.querySelector("#attack-button").addEventListener("click", attack);
document.querySelector("#architect-clear-button").addEventListener("click", clearAdditions);
document.querySelector("#architect-fit-button").addEventListener("click", () => {
  fitView();
  setMessage("Fitted the whole complex");
});
document.querySelector("#architect-reset-button").addEventListener("click", () =>
  loadChallenge(levelSelect.value),
);
levelSelect.addEventListener("change", () => loadChallenge(levelSelect.value));

window.addEventListener("keydown", (event) => {
  const tag = document.activeElement?.tagName;
  if (tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA") return;
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    deleteSelection();
  }
  if (event.key === "Escape") setMode("select", "Select or drag a cell");
});

applyView();
loadChallenge(levelSelect.value);
