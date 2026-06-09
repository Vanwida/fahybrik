const DISCIPLINE_LABELS: Record<string, string> = {
  hyrox: 'HYROX',
  crossfit: 'CrossFit',
  hybrid: 'Híbrido',
  running: 'Running',
  strength: 'Fuerza',
  other: 'Atleta híbrido',
};

export function disciplineLabel(value: string | null | undefined): string {
  if (!value) return 'Atleta híbrido';
  return DISCIPLINE_LABELS[value] ?? value;
}

export function initialsFromName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}
