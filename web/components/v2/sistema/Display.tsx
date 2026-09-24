'use client';

import { useState } from 'react';
import { ChevronDown, Clock, MessageCircle } from 'lucide-react';
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  Checkbox,
  KPI,
  KPIRow,
  Kbd,
  List,
  ListRow,
  Menu,
  Meter,
  SectionHeader,
  Sparkline,
  StatusBadge,
  Tag,
  useToast,
  type StatusTone,
} from '@/components/v2/ui';
import { Block, Panel, Spec } from './parts';

const TONES: [StatusTone, string][] = [
  ['danger', 'Pago vencido'],
  ['warn', '2 sin hacer (7 d)'],
  ['ok', 'Al día'],
  ['info', 'Alta pendiente'],
  ['neutral', 'Pausado'],
];

const TREND = [71, 72, 70, 73, 71, 69, 70, 66, null, 61, 55, 49, 44, 42];
const DAYS = ['10 sept', '11 sept', '12 sept', '13 sept', '14 sept', '15 sept', '16 sept', '17 sept', '18 sept', '19 sept', '20 sept', '21 sept', '22 sept', '23 sept'];

const INBOX = [
  { id: 'mc', name: 'Marta Costa', level: 'N3', tone: 'danger' as const, label: 'Readiness 31', ev: '−24 vs su base · 3 días seguidos', age: '2 h', act: 'Proponer descarga' },
  { id: 'xp', name: 'Xavi Prat', level: 'N3', tone: 'info' as const, label: 'Por responder', ev: '«¿Qué peso pongo si no llego al pautado?»', age: '19 h', act: 'Responder', icon: MessageCircle },
  { id: 'jo', name: 'Joan Ortega', level: 'N4', tone: 'warn' as const, label: 'Entrenos', ev: '2 de 4 debidos sin hacer (7 d) · +1 señal', age: '1 d', act: 'Mensaje' },
];

export function Display() {
  const { toast } = useToast();
  const [picked, setPicked] = useState<string[]>([]);
  const snooze = (name: string, when: string) =>
    toast({ title: `${name} pospuesto ${when}`, description: 'Vuelve a Hoy si la señal empeora.', undo: () => {} });

  return (
    <>
      <Block id="etiquetas" title="Etiquetas" note="Estado = icono + etiqueta + tono, nunca un punto solo. Tag = metadato neutro. El rojo es solo para lo vencido o fallido que pide actuar.">
        <Panel>
          <Spec label="StatusBadge · texto">
            {TONES.map(([t, l]) => (
              <StatusBadge key={t} tone={t} label={l} />
            ))}
          </Spec>
          <Spec label="StatusBadge · suave">
            {TONES.map(([t, l]) => (
              <StatusBadge key={t} tone={t} label={l} variant="soft" />
            ))}
            <StatusBadge tone="ok" label="Visible" variant="soft" size="sm" />
            <StatusBadge tone="warn" label="Oculta" variant="soft" size="sm" />
          </Spec>
          <Spec label="Tag">
            <Tag>N3</Tag>
            <Tag>Descarga</Tag>
            <Tag icon={Clock}>45′</Tag>
            <Tag>Grupo Martes-Jueves</Tag>
          </Spec>
          <Spec label="Avatar · Kbd">
            <Avatar name="Marta Costa" size="xs" />
            <Avatar name="Marta Costa" size="sm" />
            <Avatar name="Óscar Martí" size="md" />
            <Avatar name="Aina Roig" size="lg" />
            <Avatar name="Iker Vidal" size="xl" />
            <span className="mx-2 h-5 w-px bg-v2-border" />
            <Kbd>J</Kbd>
            <Kbd>K</Kbd>
            <Kbd>⌘K</Kbd>
            <Kbd>Esc</Kbd>
          </Spec>
        </Panel>
      </Block>

      <Block id="datos" title="Datos" note="El número es el héroe: etiqueta arriba, cifra tabular, delta al lado, contexto debajo. Sin dato = «—» y el porqué, nunca un 0.">
        <div className="flex flex-col gap-3">
          <KPIRow>
            <KPI label="Te necesitan" value={14} caption="de 100 atletas" />
            <KPI label="Ven su semana" value="53" unit="de 100" delta={{ value: '+6', direction: 'up', good: true }} caption="desde el lunes" />
            <KPI label="Adh. media 14 d" value="78 %" delta={{ value: '−4', direction: 'down', good: false }} caption="solo lo debido" />
            <KPI label="Readiness media" value={null} caption="sin datos esta semana" />
          </KPIRow>
          <Panel>
            <Spec label="Sparkline">
              <span className="inline-flex items-center gap-2 t-body-sm font-semibold t-tnum">
                42
                <Sparkline aria-label="Readiness 14 días, bajando de 71 a 42" values={TREND} labels={DAYS} endTone="danger" band={{ low: 62, high: 76 }} />
              </span>
              <span className="inline-flex items-center gap-2 t-body-sm font-semibold t-tnum">
                78
                <Sparkline aria-label="Readiness estable" values={[74, 76, 75, 77, 78, 76, 78, 79, 77, 78]} />
              </span>
              <Sparkline aria-label="Readiness 14 días (grande)" values={TREND} labels={DAYS} width={240} height={40} band={{ low: 62, high: 76 }} endTone="danger" />
              <Sparkline aria-label="Sin datos" values={[null, null]} />
            </Spec>
            <Spec label="Meter">
              <Meter label="Adherencia 14 días" value={67} valueLabel="67 %" />
              <Meter label="Adherencia 14 días" value={100} target={80} />
              <Meter label="Semanas del programa" value={3} max={4} valueLabel="sem 3 de 4" width={72} />
              <Meter label="Adherencia 14 días" value={null} />
              <Meter label="Carga" value={92} tone="warn" valueLabel="92 %" />
            </Spec>
          </Panel>
        </div>
      </Block>

      <Block id="estructura" title="Estructura" note="PageHeader arriba de cada página; SectionHeader dentro; Card plana; ListRow para bandejas. Nunca una tarjeta dentro de otra.">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-2">
            <SectionHeader title="Crítico" count={3} action={<Button variant="ghost" size="sm">Ver todos</Button>} />
            <List aria-label="Crítico">
              {INBOX.map((r, i) => (
                <ListRow
                  key={r.id}
                  active={i === 0}
                  selected={picked.includes(r.id)}
                  onClick={() => toast({ title: `Abrir ${r.name}` })}
                  leading={
                    <>
                      <Checkbox
                        aria-label={`Seleccionar ${r.name}`}
                        checked={picked.includes(r.id)}
                        onCheckedChange={(c) => setPicked((p) => (c ? [...p, r.id] : p.filter((x) => x !== r.id)))}
                      />
                      <Avatar name={r.name} />
                    </>
                  }
                  title={
                    <>
                      {r.name} <span className="ml-1 t-meta text-v2-faint">{r.level}</span>
                    </>
                  }
                  detail={
                    <>
                      <StatusBadge tone={r.tone} label={r.label} icon={r.icon} />
                      <span className="truncate">{r.ev}</span>
                    </>
                  }
                  meta={r.age}
                  trailing={
                    <>
                      <Button size="sm" className="hidden sm:inline-flex">
                        {r.act}
                      </Button>
                      <Menu
                        trigger={
                          <Button size="sm" variant="ghost" iconEnd={ChevronDown}>
                            Posponer
                          </Button>
                        }
                        items={[
                          { label: '1 día', onSelect: () => snooze(r.name, '1 día') },
                          { label: '3 días', onSelect: () => snooze(r.name, '3 días') },
                          { label: 'Hasta nueva señal', onSelect: () => snooze(r.name, 'hasta nueva señal'), checked: true },
                        ]}
                      />
                    </>
                  }
                />
              ))}
            </List>
          </div>
          <Card>
            <CardHeader title="Marta Costa" subtitle="N3 · HYROX en 38 d · 31 oct" />
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <span className="t-label text-v2-faint">Readiness · 14 d</span>
                <span className="t-title-sm text-v2-danger t-tnum">31</span>
              </div>
              <Sparkline aria-label="Readiness de Marta" values={TREND} labels={DAYS} width={266} height={36} band={{ low: 62, high: 76 }} endTone="danger" />
              <p className="t-meta text-v2-faint">Franja gris = su rango normal (28 d).</p>
              <div className="rounded-ctl bg-v2-surface-2 px-3 py-2 t-body-sm">
                «Muy cansada, dormí fatal dos noches seguidas»
                <div className="mt-0.5 t-meta text-v2-faint">Check-in · hoy 07:40</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm">
                  Proponer descarga
                </Button>
                <Button size="sm">Responder</Button>
              </div>
            </div>
          </Card>
        </div>
      </Block>
    </>
  );
}
