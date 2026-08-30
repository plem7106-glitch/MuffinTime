export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

export function shuffle(array, rng = Math.random) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function pickRandomIndices(length, n, rng = Math.random) {
  const indices = shuffle(
    Array.from({ length }, (_, i) => i),
    rng
  );
  return indices.slice(0, Math.min(n, length));
}
