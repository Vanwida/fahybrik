// Official HYROX station specifications keyed by exercise slug.
// Pre-fills segment params when Pablo drops a station onto the canvas.
// Source: HYROX rulebook. Update when HYROX revises spec.

export interface StationDefault {
  distance_meters?: number;
  reps?: number;
  weight_kg?: number;
  alt_classes?: string[];
}

export const HYROX_STATION_DEFAULTS: Record<string, StationDefault> = {
  'ski-erg': { distance_meters: 1000 },
  'sled-push': {
    distance_meters: 50,
    weight_kg: 152,
    alt_classes: ['102 kg (W)', '152 kg (M)', '50 kg (entrenamiento)'],
  },
  'sled-pull': {
    distance_meters: 50,
    weight_kg: 103,
    alt_classes: ['78 kg (W)', '103 kg (M)'],
  },
  'burpee-broad-jump': { distance_meters: 80 },
  'rowing': { distance_meters: 1000 },
  'farmers-carry': {
    distance_meters: 200,
    weight_kg: 24,
    alt_classes: ['16 kg/mano (W)', '24 kg/mano (M)'],
  },
  'sandbag-lunges': {
    distance_meters: 100,
    weight_kg: 20,
    alt_classes: ['10 kg (W)', '20 kg (M)'],
  },
  'wall-balls': {
    reps: 100,
    weight_kg: 9,
    alt_classes: ['4 kg', '6 kg', '9 kg', '12 kg'],
  },
};
