'use client';

import { useState } from 'react';
import { ArrowRight, CalendarDays, ChevronDown, Ellipsis, LayoutGrid, List, Plus, Search, Send, Table2, Trash2 } from 'lucide-react';
import {
  Button,
  Checkbox,
  Combobox,
  MultiCombobox,
  Field,
  FilterChip,
  IconButton,
  Input,
  SegmentedControl,
  Select,
  Switch,
  Tabs,
  Textarea,
} from '@/components/v2/ui';
import { Block, Panel, Spec } from './parts';

const LEVELS = [
  { value: 'n1', label: 'N1 · Base' },
  { value: 'n2', label: 'N2' },
  { value: 'n3', label: 'N3', hint: '27' },
  { value: 'n4', label: 'N4', hint: '31' },
  { value: 'n5', label: 'N5 · Élite', disabled: true },
];
const PEOPLE = [
  { value: 1, label: 'Marta Costa', hint: 'N3' },
  { value: 2, label: 'Óscar Martí', hint: 'N4' },
  { value: 3, label: 'Aina Roig', hint: 'N2' },
  { value: 4, label: 'Iker Vidal', hint: 'N5' },
  { value: 5, label: 'Nerea Puig', hint: 'N3' },
];

export function Controls() {
  const [level, setLevel] = useState<string | null>('n3');
  const [person, setPerson] = useState<number | null>(null);
  const [people, setPeople] = useState<typeof PEOPLE>([PEOPLE[0]!]);
  const [tab, setTab] = useState<'plan' | 'rendimiento' | 'perfil'>('plan');
  const [view, setView] = useState<'tabla' | 'tarjetas'>('tabla');
  const [range, setRange] = useState<'semana' | '3' | 'plan'>('3');
  const [chip, setChip] = useState('necesitan');
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  const [sw, setSw] = useState(true);
  const [loading, setLoading] = useState(false);

  return (
    <>
      <Block id="botones" title="Botones" note="Rectángulo de 6 px. Un primario por vista. 28 en filas · 32 en barras · 40 en formularios. IconButton siempre con tooltip.">
        <Panel>
          <Spec label="Variantes · md">
            <Button variant="primary">Publicar semana</Button>
            <Button>Asignar programa</Button>
            <Button variant="ghost">Posponer</Button>
            <Button variant="destructive" icon={Trash2}>
              Borrar programa
            </Button>
          </Spec>
          <Spec label="Tamaños">
            <Button variant="primary" size="sm">
              Responder
            </Button>
            <Button variant="primary" size="md">
              Responder
            </Button>
            <Button variant="primary" size="lg">
              Responder
            </Button>
            <Button size="sm">Mensaje</Button>
            <Button size="lg">Mensaje</Button>
          </Spec>
          <Spec label="Con icono">
            <Button icon={Plus}>Nuevo</Button>
            <Button iconEnd={ChevronDown}>Posponer</Button>
            <Button variant="ghost" iconEnd={ArrowRight}>
              Abrir ficha
            </Button>
            <Button variant="primary" icon={Send}>
              Enviar a 12
            </Button>
          </Spec>
          <Spec label="Estados">
            <Button
              variant="primary"
              loading={loading}
              onClick={() => {
                setLoading(true);
                window.setTimeout(() => setLoading(false), 1600);
              }}
            >
              {loading ? 'Publicando…' : 'Pulsa: cargando'}
            </Button>
            <Button disabled>Desactivado</Button>
            <Button variant="primary" disabled>
              Desactivado
            </Button>
          </Spec>
          <Spec label="IconButton">
            <IconButton icon={Ellipsis} label="Más acciones" />
            <IconButton icon={Search} label="Buscar" shortcut="⌘K" />
            <IconButton icon={CalendarDays} label="Ver semana" variant="secondary" />
            <IconButton icon={Trash2} label="Borrar" size="sm" />
          </Spec>
        </Panel>
      </Block>

      <Block id="campos" title="Campos" note="Etiqueta siempre visible (Field) o aria-label. Error en rojo y en palabras.">
        <Panel>
          <Spec label="Input · tamaños" className="max-w-[560px]">
            <Input size="sm" placeholder="sm · 28" className="w-32" />
            <Input placeholder="md · 32" className="w-32" />
            <Input size="lg" placeholder="lg · 40" className="w-32" />
          </Spec>
          <Spec label="Con icono / unidad" className="max-w-[560px]">
            <Input icon={Search} placeholder="Buscar atleta…" className="w-60" aria-label="Buscar atleta" />
            <Input defaultValue="82,5" trailing="kg" className="w-28" aria-label="Carga" inputMode="decimal" />
            <Input disabled defaultValue="Bloqueado" className="w-32" aria-label="Bloqueado" />
          </Spec>
          <Spec label="Field">
            <div className="grid w-full max-w-[560px] gap-4 sm:grid-cols-2">
              <Field label="Nombre del programa" hint="Lo ve el atleta.">
                {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} size="lg" defaultValue="Base aeróbica" />}
              </Field>
              <Field label="Correo" error="Falta la arroba.">
                {({ id, describedBy, invalid }) => (
                  <Input id={id} aria-describedby={describedBy} invalid={invalid} size="lg" defaultValue="marta.costa" />
                )}
              </Field>
            </div>
          </Spec>
          <Spec label="Textarea">
            <Textarea aria-label="Nota privada" placeholder="Nota privada: solo la ves tú…" className="max-w-[560px]" />
          </Spec>
          <Spec label="Select · Combobox">
            <Select aria-label="Nivel" options={LEVELS} value={level} onValueChange={setLevel} className="w-44" />
            <Select aria-label="Nivel (vacío)" options={LEVELS} value={null} onValueChange={setLevel} placeholder="Nivel" size="sm" className="w-32" />
            <Combobox aria-label="Atleta" options={PEOPLE} value={person} onValueChange={setPerson} placeholder="Buscar atleta…" className="w-60" />
          </Spec>
          <Spec label="MultiCombobox">
            <MultiCombobox
              aria-label="Atletas"
              options={PEOPLE}
              value={people}
              onValueChange={setPeople}
              getKey={(o) => String(o.value)}
              getLabel={(o) => o.label}
              getHint={(o) => o.hint}
              placeholder="Añadir atletas…"
              className="max-w-[420px]"
            />
          </Spec>
          <Spec label="Casillas · interruptor">
            <Checkbox checked={a} onCheckedChange={setA} label="Avisar al atleta" />
            <Checkbox checked={b} onCheckedChange={setB} label="Sin marcar" />
            <Checkbox checked indeterminate onCheckedChange={() => {}} aria-label="Parcial" />
            <Checkbox checked={false} disabled onCheckedChange={() => {}} label="Desactivada" />
            <Switch checked={sw} onCheckedChange={setSw} label="Publicar 2 días antes" />
          </Spec>
        </Panel>
      </Block>

      <Block id="navegacion" title="Navegación" note="Tabs = secciones de página (un nivel). SegmentedControl = cambiar la vista. FilterChip = la única pastilla. La selección es tinta, nunca el color del club.">
        <Panel>
          <Spec label="Tabs">
            <div className="w-full">
              <Tabs
                aria-label="Ficha"
                value={tab}
                onValueChange={setTab}
                items={[
                  { value: 'plan', label: 'Plan' },
                  { value: 'rendimiento', label: 'Rendimiento' },
                  { value: 'perfil', label: 'Perfil', count: 3 },
                ]}
              />
            </div>
          </Spec>
          <Spec label="SegmentedControl">
            <SegmentedControl
              aria-label="Vista"
              value={view}
              onValueChange={setView}
              items={[
                { value: 'tabla', label: 'Tabla', icon: Table2 },
                { value: 'tarjetas', label: 'Tarjetas', icon: LayoutGrid },
              ]}
            />
            <SegmentedControl
              aria-label="Rango"
              size="sm"
              value={range}
              onValueChange={setRange}
              items={[
                { value: 'semana', label: 'Semana' },
                { value: '3', label: '3 semanas' },
                { value: 'plan', label: 'Plan completo', icon: List },
              ]}
            />
          </Spec>
          <Spec label="FilterChip">
            {[
              ['necesitan', 'Necesitan algo', 14],
              ['todos', 'Todos', 100],
              ['sinplan', 'Sin plan', 30],
              ['oculta', 'No ven su semana', 47],
            ].map(([id, label, n]) => (
              <FilterChip key={id} active={chip === id} count={n as number} onClick={() => setChip(id as string)}>
                {label}
              </FilterChip>
            ))}
            <FilterChip variant="add" icon={Plus}>
              Guardar vista
            </FilterChip>
          </Spec>
        </Panel>
      </Block>
    </>
  );
}
