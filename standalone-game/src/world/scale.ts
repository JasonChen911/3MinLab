/** One world unit is one metre. All model and collider sizes use this scale. */
export const WORLD_UNIT = 1;

export const SCALE_REFERENCE = {
  person: {min: 1.6, max: 1.9, model: 1.72, colliderRadius: .34},
  door: {minWidth: .9, maxWidth: 1.2, minHeight: 2, maxHeight: 2.2, venueWidth: 3.6, venueHeight: 2.2},
  aisle: {normalMin: 1.5, normalMax: 2, mainMin: 3, mainMax: 5},
  table: {minHeight: .7, maxHeight: .8},
  chair: {minHeight: .8, maxHeight: 1},
  floor: {minHeight: 3, maxHeight: 4},
  stage: {minHeight: .6, maxHeight: 1.5},
  grid: 1,
} as const;

export interface ScaledFootprint {
  width: number;
  depth: number;
  height: number;
  scale: number;
}

/** Debug/QA helper: report how an item occupies space in metres. */
export function footprint(width: number, depth: number, height: number, scale = 1): ScaledFootprint {
  return {
    width: Math.round(width * scale * 100) / 100,
    depth: Math.round(depth * scale * 100) / 100,
    height: Math.round(height * scale * 100) / 100,
    scale,
  };
}
