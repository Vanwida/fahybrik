'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, CalendarPlus, Eye, Pause, Send } from 'lucide-react';
import {
  Avatar,
  BulkBar,
  Button,
  DataTable,
  KPI,
  Meter,
  Sheet,
  Sparkline,
  StatusBadge,
  Tag,
  useToast,
  type DataTableColumn,
} from '@/components/v2/ui';
import { demoAthletes, statusRank, type DemoAthlete } from './demo-data';
import { Block } from './parts';

const WEEK = {
  visible: { tone: 'ok', label: 'Visible' },
  oculta: { tone: 'warn', label: 'Oculta' },
  sin_plan: { tone: 'neutral', label: 'Sin plan' },
} as const;

export function TableDemo() {
  const rows = useMemo(() => demoAthletes(320), []);
  const [selection, setSelection] = useState<string[]>([]);
  const [peek, setPeek] = useState<DemoAthlete | null>(null);
  const { toast } = useToast();

  const columns: DataTableColumn<DemoAthlete>[] = [
    {
      id: 'name',
      header: 'Atleta',
      width: '200px',
      sortValue: (r) => r.name,
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={r.name} size="sm" />
          <span className="truncate font-medium">{r.name}</span>
          <span className="t-meta text-v2-faint">{r.level}</span>
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Estado · motivo',
      width: '190px',
      sortValue: (r) => statusRank(r.status.tone),
      cell: (r) => <StatusBadge tone={r.status.tone} label={r.status.label} />,
    },
    {
      id: 'week',
      header: 'Semana',
      width: '104px',
      hideBelow: 'md',
      sortValue: (r) => r.week,
      cell: (r) => <StatusBadge tone={WEEK[r.week].tone} label={WEEK[r.week].label} variant="soft" size="sm" />,
    },
    {
      id: 'readiness',
      header: 'Readiness 14 d',
      width: '140px',
      hideBelow: 'md',
      sortValue: (r) => r.readiness,
      cell: (r) =>
        r.readiness == null ? (
          <span className="text-v2-faint">sin datos</span>
        ) : (
          <span className="flex items-center gap-2 font-semibold t-tnum">
            <span className="w-6">{r.readiness}</span>
            <Sparkline aria-label={`Readiness de ${r.name}`} values={r.trend} width={60} height={18} endTone={r.status.tone === 'danger' ? 'danger' : 'neutral'} />
          </span>
        ),
    },
    {
      id: 'adh',
      header: 'Adh. 14 d',
      width: '104px',
      hideBelow: 'lg',
      sortValue: (r) => r.adherence,
      defaultDir: 'asc',
      cell: (r) => <Meter label={`Adherencia 14 días de ${r.name}`} value={r.adherence} width={40} />,
    },
    {
      id: 'last',
      header: 'Últ. entreno',
      width: '104px',
      hideBelow: 'lg',
      sortValue: (r) => r.lastDays,
      cell: (r) => <span className="text-v2-muted">{r.last}</span>,
    },
    { id: 'next', header: 'Próximo', hideBelow: 'xl', cell: (r) => <span className="text-v2-muted">{r.next}</span> },
    {
      id: 'race',
      header: 'Carrera',
      width: '88px',
      align: 'right',
      hideBelow: 'sm',
      sortValue: (r) => r.raceDays,
      cell: (r) => (r.raceDays == null ? <span className="text-v2-faint">—</span> : <span className="text-v2-muted">{r.raceDays} d</span>),
    },
  ];

  const n = selection.length;
  const bulk = (verb: string) => {
    toast({ tone: 'ok', title: `${verb} · ${n} atletas`, undo: () => setSelection(selection) });
    setSelection([]);
  };

  return (
    <Block
      id="tabla"
      title="DataTable"
      note="320 filas con ventana. Cabecera fija y ordenable (aria-sort). Casillas con ⇧ para rango. Teclado: J/K mover · X marcar (⇧X rango) · Enter abrir · Esc limpiar."
    >
      <DataTable
        aria-label="Atletas (demostración)"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        defaultSort={{ id: 'status', dir: 'asc' }}
        selection={selection}
        onSelectionChange={setSelection}
        onRowOpen={setPeek}
        onActiveChange={(id) => {
          if (peek) setPeek(rows.find((r) => r.id === id) ?? null);
        }}
        virtualize
        maxHeight="440px"
      />
      <BulkBar count={n} onClear={() => setSelection([])} noun={['atleta', 'atletas']}>
        <Button size="sm" icon={CalendarPlus} onClick={() => bulk('Programa asignado')}>
          Asignar programa
        </Button>
        <Button size="sm" icon={Eye} onClick={() => bulk('Semana publicada')}>
          Publicar semana
        </Button>
        <Button size="sm" icon={Send} onClick={() => bulk('Mensaje enviado')}>
          Mensaje
        </Button>
        <Button size="sm" icon={Pause} onClick={() => bulk('Pausados')}>
          Pausar
        </Button>
      </BulkBar>
      <Sheet
        open={peek != null}
        onOpenChange={(o) => !o && setPeek(null)}
        modal={false}
        title={peek?.name ?? ''}
        description={peek ? `${peek.level} · ${peek.raceDays != null ? `carrera en ${peek.raceDays} d` : 'sin carrera'}` : undefined}
        actions={
          <Button size="sm" variant="ghost" iconEnd={ArrowRight}>
            Abrir ficha
          </Button>
        }
      >
        {peek ? (
          <div className="flex flex-col gap-5">
            <StatusBadge tone={peek.status.tone} label={peek.status.label} variant="soft" />
            <div className="grid grid-cols-2 gap-4">
              <KPI label="Readiness" value={peek.readiness} caption="hoy · base 28 d" />
              <KPI label="Adh. 14 d" value={peek.adherence == null ? null : `${peek.adherence} %`} caption="solo lo debido" />
            </div>
            <Sparkline aria-label="Readiness 14 días" values={peek.trend} width={400} height={40} className="max-w-full" />
            <div className="flex flex-wrap gap-2">
              <Tag>{peek.level}</Tag>
              <Tag>Último: {peek.last}</Tag>
              <Tag>Próximo: {peek.next}</Tag>
            </div>
            <p className="t-meta text-v2-faint">Panel no modal: la tabla sigue viva detrás (J/K cambia de atleta). Esc cierra.</p>
          </div>
        ) : null}
      </Sheet>
    </Block>
  );
}
