'use client';

import { useState } from 'react';
import { Archive, ChevronDown, Copy, Ellipsis, Filter, MessageSquare, Pencil, SearchX, Trash2, Users } from 'lucide-react';
import {
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  ErrorState,
  IconButton,
  Menu,
  Popover,
  Sheet,
  Skeleton,
  SkeletonRows,
  Textarea,
  Tooltip,
  useToast,
} from '@/components/v2/ui';
import { Block, Panel, Spec } from './parts';

export function Overlays() {
  const { toast } = useToast();
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [levels, setLevels] = useState<string[]>(['N3']);

  return (
    <>
      <Block id="capas" title="Capas" note="Diálogo = confirmar o un formulario corto. Sheet = panel lateral (modal o no). Menú, popover y tooltip montan dentro del panel; Escape cierra todo.">
        <Panel>
          <Spec label="Dialog · Sheet">
            <Button variant="destructive" icon={Trash2} onClick={() => setDialog(true)}>
              Borrar programa…
            </Button>
            <Button onClick={() => setSheet(true)}>Abrir panel lateral</Button>
          </Spec>
          <Spec label="Menu">
            <Menu
              trigger={<IconButton icon={Ellipsis} label="Acciones de la semana" variant="secondary" />}
              items={[
                { type: 'label', label: 'Semana 21–27 sept' },
                { label: 'Copiar semana', icon: Copy, onSelect: () => toast({ title: 'Semana copiada' }), shortcut: '⌘C' },
                { label: 'Editar', icon: Pencil, onSelect: () => {} },
                { label: 'Archivar', icon: Archive, onSelect: () => {}, disabled: true },
                { type: 'separator' },
                { label: 'Borrar semana', icon: Trash2, danger: true, onSelect: () => setDialog(true) },
              ]}
            />
            <Menu
              align="start"
              trigger={<Button iconEnd={ChevronDown}>+ Nuevo</Button>}
              items={[
                { label: 'Atleta', icon: Users, onSelect: () => {} },
                { label: 'Programa', icon: Copy, onSelect: () => {} },
                { label: 'Mensaje a…', icon: MessageSquare, onSelect: () => {} },
              ]}
            />
          </Spec>
          <Spec label="Popover · Tooltip">
            <Popover title="Nivel" trigger={<Button icon={Filter}>Nivel {levels.length ? `· ${levels.length}` : ''}</Button>}>
              <div className="flex flex-col gap-2.5">
                {['N1', 'N2', 'N3', 'N4', 'N5'].map((l) => (
                  <Checkbox
                    key={l}
                    label={l}
                    checked={levels.includes(l)}
                    onCheckedChange={(c) => setLevels((p) => (c ? [...p, l] : p.filter((x) => x !== l)))}
                  />
                ))}
              </div>
            </Popover>
            <Tooltip content="Marcar como hecho" shortcut="E">
              <Button variant="ghost">Pasa por encima</Button>
            </Tooltip>
          </Spec>
          <Spec label="Toast">
            <Button onClick={() => toast({ tone: 'ok', title: 'Hecho · Marta Costa', description: 'Sale de Hoy.', undo: () => void toast({ title: 'Deshecho' }) })}>
              Con deshacer
            </Button>
            <Button onClick={() => toast({ title: 'Semana publicada a 47 atletas', action: { label: 'Ver', onClick: () => {} } })}>Neutro</Button>
            <Button onClick={() => toast({ tone: 'danger', title: 'No se ha podido publicar', description: 'Sin conexión. Nada ha cambiado.' })}>
              Error
            </Button>
          </Spec>
        </Panel>
        <Dialog
          open={dialog}
          onOpenChange={setDialog}
          size="sm"
          title="¿Borrar «Base aeróbica»?"
          description="Lo usan 12 atletas. Sus entrenos ya hechos se conservan; los futuros desaparecen."
          footer={
            <>
              <Button onClick={() => setDialog(false)}>Cancelar</Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setDialog(false);
                  toast({ title: 'Programa borrado', undo: () => {} });
                }}
              >
                Borrar programa
              </Button>
            </>
          }
        />
        <Sheet
          open={sheet}
          onOpenChange={setSheet}
          title="Asignar programa"
          description="A 12 atletas · empieza el lunes 28 sept"
          footer={
            <>
              <Button onClick={() => setSheet(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => setSheet(false)}>
                Asignar a 12
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <p className="t-body text-v2-muted">Panel modal: atrapa el foco y oscurece el fondo.</p>
            <Textarea aria-label="Nota para los atletas" placeholder="Nota para los atletas (opcional)" />
          </div>
        </Sheet>
      </Block>

      <Block id="estados" title="Estados" note="Vacío en una línea dentro de su sección; página vacía solo si no hay nada más. Esqueleto con la forma de lo que viene. Error honesto con Reintentar.">
        <Panel>
          <Spec label="EmptyState · línea">
            <EmptyState title="Sin series con ritmo en 4 semanas" action={<Button size="sm" variant="ghost">Programar un test</Button>} />
          </Spec>
          <Spec label="ErrorState · línea">
            <ErrorState title="No se ha podido cargar la readiness" description="la sincronización falló a las 07:10" onRetry={() => {}} className="w-full max-w-[560px]" />
          </Spec>
          <Spec label="Skeleton">
            <div className="flex w-full max-w-[560px] flex-col gap-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-64" />
                </div>
              </div>
              <div className="overflow-hidden rounded-ctl border border-v2-border">
                <SkeletonRows rows={3} />
              </div>
            </div>
          </Spec>
        </Panel>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-panel border border-v2-border bg-v2-surface">
            <EmptyState
              variant="page"
              icon={SearchX}
              title="Ningún atleta coincide"
              description="Quita un filtro o busca por otro nombre."
              action={<Button>Quitar filtros</Button>}
            />
          </div>
          <div className="rounded-panel border border-v2-border bg-v2-surface">
            <ErrorState variant="page" description="El servidor no ha respondido. Tus cambios están a salvo." onRetry={() => {}} />
          </div>
        </div>
      </Block>
    </>
  );
}
