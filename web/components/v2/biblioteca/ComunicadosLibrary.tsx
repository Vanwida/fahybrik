'use client';

import { useEffect, useState } from 'react';
import { Edit3, MoreHorizontal, Plus, Search, Send, Trash2 } from 'lucide-react';
import { MAX_PUBLISH_RECIPIENTS, type CoachCommunicationDTO } from '@fahybrid/shared/domain/coach-communications';
import { AthletePicker, type PickedAthlete } from '@/components/v2/shared/AthletePicker';
import { Button, Dialog, EmptyState, ErrorState, FilterChip, IconButton, Input, Menu, SkeletonRows, Tag, useToast } from '@/components/v2/ui';
import { Compositor, type Destinatario, type ModoCompositor, type PartidaCompositor } from '../atleta-detalle/del-coach/Compositor';
import { metaComunicado, useBiblioteca } from '../atleta-detalle/del-coach/biblioteca';
import { coincideComunicado, KIND_COACH_LABEL } from '@/lib/dashboard/v2/del-coach';
import { desdeComunicado } from '@/lib/dashboard/v2/del-coach-borrador';

type Editor = { modo: ModoCompositor; destinatarios: Destinatario[]; partida?: PartidaCompositor };

/** Categoría de Biblioteca: moldes editables y borradores retomables, sin bandeja global. */
export function ComunicadosLibrary({ coachName }: { coachName: string }) {
  const biblioteca = useBiblioteca();
  const { cargar } = biblioteca;
  const { toast } = useToast();
  const [vista, setVista] = useState<'templates' | 'drafts'>('templates');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [enviar, setEnviar] = useState<{ desde?: CoachCommunicationDTO } | null>(null);
  const [atletas, setAtletas] = useState<PickedAthlete[]>([]);
  const [borrar, setBorrar] = useState<CoachCommunicationDTO | null>(null);
  useEffect(() => { void cargar(); }, [cargar]);

  const publicarA = (desde?: CoachCommunicationDTO) => {
    setAtletas([]);
    setEnviar({ desde });
  };
  const empezar = () => {
    if (!enviar || atletas.length === 0 || atletas.length > MAX_PUBLISH_RECIPIENTS) return;
    const c = enviar.desde;
    setEditor({
      modo: 'publicar',
      destinatarios: atletas.map((a) => ({ athlete_id: a.id, full_name: a.label })),
      // Plantilla = copia; borrador = mismo id, también si falló una publicación.
      partida: c ? { b: desdeComunicado(c), id: c.is_template ? null : c.id } : undefined,
    });
    setEnviar(null);
  };
  const eliminar = async () => {
    if (!borrar) return;
    const deleted = await biblioteca.borrar(borrar.id);
    if (deleted) { setBorrar(null); toast({ title: borrar.is_template ? 'Plantilla eliminada' : 'Borrador eliminado' }); }
  };
  const rows = (vista === 'templates' ? biblioteca.plantillas : biblioteca.borradores) ?? [];
  const filtered = rows.filter((c) => coincideComunicado(c, query.trim().toLowerCase()));
  const tooMany = atletas.length > MAX_PUBLISH_RECIPIENTS;

  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label="Estado del comunicado">
        <FilterChip active={vista === 'templates'} count={biblioteca.plantillas?.length} onClick={() => setVista('templates')}>Plantillas</FilterChip>
        <FilterChip active={vista === 'drafts'} count={biblioteca.borradores?.length} onClick={() => setVista('drafts')}>Sin publicar</FilterChip>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button icon={Plus} onClick={() => setEditor({ modo: 'plantilla', destinatarios: [] })}>Nueva plantilla</Button>
        <Button variant="primary" icon={Send} onClick={() => publicarA()}>Nuevo comunicado…</Button>
      </div>
    </div>
    <Input icon={Search} aria-label="Buscar comunicados" placeholder="Buscar por título o contenido…" value={query} onChange={(e) => setQuery(e.target.value)} />
    {biblioteca.error ? <ErrorState title={biblioteca.error} onRetry={biblioteca.reintentar} /> : null}
    {biblioteca.cargando ? <SkeletonRows rows={5} /> : biblioteca.plantillas === null ? null : filtered.length === 0 ? <EmptyState
      title={query ? 'No hay comunicados con esa búsqueda' : vista === 'templates' ? 'Todavía no hay plantillas' : 'No tienes borradores pendientes'}
      description={query ? undefined : vista === 'templates' ? 'Guarda lo que reutilizas y personalízalo antes de publicarlo.' : 'Lo que guardes sin publicar aparecerá aquí.'}
    /> : <ul className="divide-y divide-v2-border rounded-panel border border-v2-border">{filtered.map((c) => (
      <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1"><p className="t-body font-medium text-v2-fg">{c.title}</p><p className="t-body-sm text-v2-muted">{metaComunicado(c)}</p></div>
        <Tag>{KIND_COACH_LABEL[c.kind]}</Tag>
        <Button size="sm" icon={Send} onClick={() => publicarA(c)}>Publicar a…</Button>
        <Menu trigger={<IconButton icon={MoreHorizontal} label={`Acciones de ${c.title}`} size="sm" />} items={[
          { label: c.is_template ? 'Editar plantilla' : 'Retomar borrador', icon: Edit3, onSelect: () => setEditor({ modo: c.is_template ? 'plantilla' : 'publicar', destinatarios: [], partida: { b: desdeComunicado(c), id: c.id } }) },
          { label: c.is_template ? 'Eliminar plantilla…' : 'Eliminar borrador…', icon: Trash2, danger: true, onSelect: () => setBorrar(c) },
        ]} />
      </li>
    ))}</ul>}
    <Dialog open={enviar !== null} onOpenChange={(open) => { if (!open) setEnviar(null); }} title="¿Quién lo recibe?"
      description={enviar?.desde ? `Personalizarás «${enviar.desde.title}» y revisarás cómo le queda antes de publicarlo.` : 'Elige uno o varios atletas. Después podrás escribir y revisar el comunicado.'}
      footer={<><Button onClick={() => setEnviar(null)}>Cancelar</Button><Button variant="primary" disabled={atletas.length === 0 || tooMany} onClick={empezar}>Escribir y revisar</Button></>}>
      <AthletePicker value={atletas} onValueChange={setAtletas} aria-label="Destinatarios del comunicado" />
      <p className="mt-3 t-body-sm text-v2-muted">{atletas.length === 0 ? 'Todavía no has elegido destinatarios.' : `${atletas.length} destinatario${atletas.length === 1 ? '' : 's'}: ${atletas.map((a) => a.label).join(', ')}.`}</p>
      {tooMany ? <ErrorState title={`Puedes publicar a un máximo de ${MAX_PUBLISH_RECIPIENTS} atletas de una vez.`} /> : null}
    </Dialog>
    <Dialog open={borrar !== null} onOpenChange={(open) => { if (!open && !biblioteca.borrando) setBorrar(null); }} title={borrar?.is_template ? 'Eliminar plantilla' : 'Eliminar borrador'}
      description={`Se eliminará «${borrar?.title ?? ''}». No se ha publicado a ningún atleta.`}
      footer={<><Button disabled={!!biblioteca.borrando} onClick={() => setBorrar(null)}>Cancelar</Button><Button variant="destructive" loading={!!biblioteca.borrando} onClick={() => void eliminar()}>Eliminar</Button></>}>
      {biblioteca.error ? <ErrorState title={biblioteca.error} /> : null}
    </Dialog>
    {editor ? <Compositor key={`${editor.modo}-${editor.partida?.id ?? 'new'}`} {...editor} coachName={coachName} onCerrar={() => setEditor(null)} onHecho={(mensaje, cambio) => {
      if (cambio.guardado) biblioteca.guardado(cambio.guardado);
      if (cambio.publicadoId) biblioteca.publicado(cambio.publicadoId);
      setEditor(null);
      toast({ title: mensaje, tone: 'ok' });
    }} /> : null}
  </div>;
}
