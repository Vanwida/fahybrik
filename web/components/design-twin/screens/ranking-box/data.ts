// Los números de la propuesta «Marcas × el box».
//
// FUENTE: docs/design/marcas-ranking-analiticas-mockup.html (aprobado). El
// histograma se guarda en ATLETAS POR BUCKET, no en alturas: es lo que calcula
// el servidor (MarkBoxView.histogram, 11 buckets de peor a mejor) y así los 47
// del pie y la curva no pueden contarse distinto. Las alturas salen de
// normalizar por el bucket más poblado.

/** Resolución del histograma — la del servidor (HISTOGRAM_BUCKETS). */
export const BUCKETS = 11;

export interface BoxStanding {
  /** La marca a la que pertenece esta posición. */
  markLabel: string;
  best: string;
  pace: string;
  age: string;
  /** % del box al que le ganas (percentile). */
  beatenPct: number;
  /** Atletas del box con marca comparable, tú incluido (n). */
  n: number;
  median: string;
  /** Extremos del eje: el peor y el mejor del box. */
  worst: string;
  bestOfBox: string;
  /** Atletas por bucket, de peor a mejor. Suma = n. */
  histogram: readonly number[];
  /** En cuál caes tú (own_bucket). */
  ownBucket: number;
  /** El mismo percentil con la marca que ya tenías hace 90 días. */
  beatenPct90dAgo: number;
}

export const REMO_500: BoxStanding = {
  markLabel: 'Remo 500 m',
  best: '1:38.4',
  pace: '1:38/500',
  age: 'hace 6 semanas',
  beatenPct: 82,
  n: 47,
  median: '1:52',
  worst: '2:10',
  bestOfBox: '1:25',
  histogram: [2, 2, 4, 5, 7, 8, 7, 5, 4, 2, 1],
  ownBucket: 8,
  beatenPct90dAgo: 50,
};

/** Top X% = a lo que NO le ganas. El pill lo dice en corto; la frase, en largo. */
export function topPct(beatenPct: number): number {
  return 100 - beatenPct;
}

export interface MarkRow {
  label: string;
  value: string;
  beatenPct: number;
  /** Progresión propia: el valor de cada intento, del más viejo al último. */
  spark: readonly number[];
}

/** «Tus marcas» dentro de Analíticas: progresión propia + posición en el box. */
export const ANALITICAS: readonly MarkRow[] = [
  { label: 'Remo 500 m', value: '1:38', beatenPct: 82, spark: [80, 70, 55, 40] },
  { label: '1 km a tope', value: '3:52', beatenPct: 69, spark: [75, 60, 50] },
  { label: 'SkiErg 1000 m', value: '3:54', beatenPct: 76, spark: [60, 52] },
];

/** Debajo del cuartil el listón se enciende en naranja; por encima, en verde. */
export const CUARTIL = 25;
