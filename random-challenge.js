(function () {
  "use strict";

  function mulberry32(seed) {
    let state = seed >>> 0;
    return function random() {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(items, random) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function randomItem(items, random) {
    return items[Math.floor(random() * items.length)];
  }

  /**
   * Build a random tree with a planted matching.
   *
   * First pair shuffled vertices. Then connect those two-vertex components by
   * random inter-component edges. The result is always a tree, while the planted
   * pair edges give every generated even Z-overlap a known valid matching.
   */
  function plantedTree(vertexCount, random) {
    const order = shuffle(
      Array.from({ length: vertexCount }, (_, index) => index),
      random,
    );
    const components = [];
    const pairEdges = [];

    for (let index = 0; index + 1 < order.length; index += 2) {
      const pair = [order[index], order[index + 1]];
      components.push(pair);
      pairEdges.push(pair);
    }
    if (order.length % 2 === 1) {
      components.push([order[order.length - 1]]);
    }

    const connectorEdges = [];
    for (let index = 1; index < components.length; index += 1) {
      const earlier = components[Math.floor(random() * index)];
      connectorEdges.push([
        randomItem(components[index], random),
        randomItem(earlier, random),
      ]);
    }
    return { pairEdges, connectorEdges, treeEdges: [...pairEdges, ...connectorEdges] };
  }

  function generatedChecks(pairEdges, random) {
    const shuffledPairs = shuffle(pairEdges, random);
    const forcedCount = Math.min(3, Math.max(2, Math.floor(pairEdges.length / 3)));
    const forcedPairs = shuffledPairs.slice(0, forcedCount);
    const hiddenPairs = shuffledPairs.slice(forcedCount);
    const checks = forcedPairs.map((pair, index) => ({
      id: `z${index}`,
      label: `Z${toSubscript(index)}`,
      support: pair.map((vertex) => `q${vertex}`),
    }));

    const largeCount = 4 + Math.floor(random() * 3);
    const seenSupports = new Set();
    for (let index = 0; index < largeCount; index += 1) {
      const pairCount = pairEdges.length >= 6 && random() < 0.35 ? 3 : 2;
      let selected;
      let supportKey;
      do {
        const requiredHidden = randomItem(hiddenPairs, random);
        const remaining = shuffle(
          pairEdges.filter((pair) => pair !== requiredHidden),
          random,
        ).slice(0, pairCount - 1);
        selected = shuffle([requiredHidden, ...remaining], random);
        supportKey = selected.flat().sort((left, right) => left - right).join(",");
      } while (seenSupports.has(supportKey));
      seenSupports.add(supportKey);

      const checkNumber = forcedCount + index;
      checks.push({
        id: `z${checkNumber}`,
        label: `Z${toSubscript(checkNumber)}`,
        support: selected.flat().map((vertex) => `q${vertex}`),
      });
    }
    return { checks, forcedPairs };
  }

  function toSubscript(value) {
    const digits = "₀₁₂₃₄₅₆₇₈₉";
    return String(value)
      .split("")
      .map((digit) => digits[Number(digit)])
      .join("");
  }

  function generateRandomChallenge(seed = Date.now()) {
    const normalizedSeed = Number(seed) >>> 0;
    const random = mulberry32(normalizedSeed);
    const vertexCount = 10 + Math.floor(random() * 7);
    const construction = plantedTree(vertexCount, random);
    const { checks, forcedPairs } = generatedChecks(construction.pairEdges, random);
    const forcedKeys = new Set(forcedPairs.map((pair) => pair.join(":")));

    const vertices = Array.from({ length: vertexCount }, (_, index) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * index) / vertexCount;
      const radialJitter = 0.9 + random() * 0.16;
      return {
        id: `q${index}`,
        label: `q${index}`,
        type: "measurement",
        x: Math.round(500 + 335 * radialJitter * Math.cos(angle)),
        y: Math.round(340 + 250 * radialJitter * Math.sin(angle)),
      };
    });

    const solutionEdges = construction.treeEdges
      .filter((pair) => !forcedKeys.has(pair.join(":")))
      .map(([source, target], index) => ({
        id: `solution-${index}`,
        source: `q${source}`,
        target: `q${target}`,
        type: "edge",
      }));

    return {
      id: "random",
      name: `Random construction #${normalizedSeed}`,
      title: "Build a random surgery complex",
      description: `Seed ${normalizedSeed} produced ${vertexCount} logical-support vertices, ${forcedPairs.length} forced size-two overlaps, and ${checks.length - forcedPairs.length} larger even Z-overlaps. Choose matching edges, connect the graph, and fill any cycles you create.`,
      hint: "The instance has at least one tree solution, so faces are optional if you choose edges carefully. Reset generates a completely new code-overlap puzzle.",
      caps: {},
      logicalX: vertices.map((vertex) => vertex.id),
      zChecks: checks,
      vertices,
      edges: [],
      faces: [],
      solutionEdges,
      solutionFaces: [],
      seed: normalizedSeed,
    };
  }

  const api = { generateRandomChallenge };
  if (typeof module === "object" && module !== null && typeof module.exports === "object") {
    module.exports = api;
  }
  if (typeof window !== "undefined") {
    window.AncillaRandomChallenge = api;
  }
})();
