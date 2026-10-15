/** Fragrantica rates longevity 1-5 and sillage 1-4; the wear log uses hours and a 1-5 projection. These map mine onto theirs. */
const LONGEVITY_POINTS: [hours: number, rating: number][] = [
  [0, 1],
  [2, 2],
  [5, 3],
  [8, 4],
  [12, 5]
]

export function hoursToLongevityRating(hours: number): number {
  if (hours <= 0) return 1
  for (let i = 1; i < LONGEVITY_POINTS.length; i++) {
    const [h1, r1] = LONGEVITY_POINTS[i]
    const [h0, r0] = LONGEVITY_POINTS[i - 1]
    if (hours <= h1) return r0 + ((hours - h0) / (h1 - h0)) * (r1 - r0)
  }
  return 5
}

export function projectionToSillageRating(projection: number): number {
  return 1 + ((Math.min(Math.max(projection, 1), 5) - 1) * 3) / 4
}
