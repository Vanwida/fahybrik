'use client';

// Selector MÚLTIPLE de atletas, grupos o los dos: el primitivo `MultiCombobox`
// (components/v2/ui) con lo propio de estas entidades — grupos primero, avatar
// o icono de grupo delante, el recuento del grupo también en su chip. Lo elegido
// viaja como objetos {kind, id, label} para que un chip nunca adivine un nombre.
//
// Base de AthletePicker, GroupPicker y del «Para» de AssignSheet. No se usa suelto
// desde las pantallas: usa los envoltorios.

import { Users } from 'lucide-react';
import { Avatar } from '@/components/v2/ui';
import { MultiCombobox, fold as foldText } from '@/components/v2/ui/MultiCombobox';

export interface PickerItem {
  kind: 'athlete' | 'group';
  id: string;
  label: string;
  /** Texto secundario: nivel del atleta, «20 atletas» del grupo. */
  hint?: string | null;
  avatar_url?: string | null;
}

/** Quita acentos y mayúsculas: «Martí» encuentra «marti». */
export const fold = foldText;

const keyOf = (i: PickerItem) => `${i.kind}:${i.id}`;
const GROUP_LABEL: Record<PickerItem['kind'], string> = { group: 'Grupos', athlete: 'Atletas' };
const GROUP_ORDER = [GROUP_LABEL.group, GROUP_LABEL.athlete];
const labelOf = (i: PickerItem) => i.label;
const hintOf = (i: PickerItem) => i.hint;
const groupOf = (i: PickerItem) => GROUP_LABEL[i.kind];
const isGroup = (i: PickerItem) => i.kind === 'group';

function Leading({ item, where }: { item: PickerItem; where: 'chip' | 'option' }) {
  if (item.kind === 'group') {
    return (
      <Users
        aria-hidden
        strokeWidth={1.75}
        className={where === 'chip' ? 'size-3.5 shrink-0 text-v2-muted' : undefined}
      />
    );
  }
  return <Avatar name={item.label} src={item.avatar_url} size="xs" className={where === 'chip' ? '-ml-0.5' : undefined} />;
}

export interface EntityPickerProps {
  value: PickerItem[];
  onValueChange: (next: PickerItem[]) => void;
  /** Opciones ya cargadas (se filtran aquí). */
  options?: PickerItem[];
  /** Búsqueda remota: se llama con el texto (≥1 carácter) tras 150 ms. */
  search?: (query: string, signal: AbortSignal) => Promise<PickerItem[]>;
  placeholder?: string;
  emptyText?: string;
  'aria-label': string;
  id?: string;
  disabled?: boolean;
  /** Error de carga de `options` (se enseña en la lista). */
  loadError?: string | null;
  className?: string;
}

export function EntityPicker(props: EntityPickerProps) {
  return (
    <MultiCombobox<PickerItem>
      {...props}
      getKey={keyOf}
      getLabel={labelOf}
      getHint={hintOf}
      getGroup={groupOf}
      groupOrder={GROUP_ORDER}
      chipHint={isGroup}
      renderLeading={(item, where) => <Leading item={item} where={where} />}
    />
  );
}
