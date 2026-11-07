/** Stadium capsule: two equal semicircles joined by parallel straights. */
export function trackPoint(radius: number, straightHalf: number, progress: number): {x: number; z: number; heading: number} {
  const lap = 2 * Math.PI * radius + 4 * straightHalf;
  let d = ((progress % 1) + 1) % 1 * lap;
  if (d < Math.PI * radius) {
    const angle = d / radius;
    return {x: radius * Math.cos(angle), z: straightHalf + radius * Math.sin(angle), heading: -angle};
  }
  d -= Math.PI * radius;
  if (d < 2 * straightHalf) return {x: -radius, z: straightHalf - d, heading: Math.PI};
  d -= 2 * straightHalf;
  if (d < Math.PI * radius) {
    const angle = Math.PI + d / radius;
    return {x: radius * Math.cos(angle), z: -straightHalf + radius * Math.sin(angle), heading: -angle};
  }
  d -= Math.PI * radius;
  return {x: radius, z: -straightHalf + d, heading: 0};
}
