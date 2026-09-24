'use client';

// Invitar atletas: uno (nombre + email) o una lista pegada / un CSV. Se elige el
// nivel, el grupo y la modalidad para todos, se ve la previa línea a línea (qué
// entra y por qué no entra lo demás) y se invita. Cada atleta usa el mismo camino
// que el alta de uno: POST /api/coach/athletes → POST …/invite (enlace de un solo
// uso); después, nivel y grupo en bloque. Al final, los enlaces para enviarlos.

import { useMemo, useRef, useState } from 'react';
import { Check, Copy, FileUp } from 'lucide-react';
import type { RosterRow } from '@/lib/dashboard/athletes/roster';
import {
  Button,
  Dialog,
  Field,
  Input,
  SegmentedControl,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '@/components/v2/ui';
import { useGroupOptions } from '@/components/v2/shared/GroupPicker';
import { apiJson, errorMessage } from '@/components/v2/shared/api';
import type { CoachLevel } from './load-atletas';
import { atletas, runBulk } from './bulk-api';
import { INVITE_ISSUE_LABEL, invitable, linksText, parseInviteList, type InviteLine } from './invite-parse';

export type InviteMode = 'uno' | 'lista';
const NONE = 'ninguno';
type Modality = 'individual' | 'dobles' | 'pro_elite';

const MODALITIES: { value: Modality; label: string }[] = [
  { value: 'individual', label: 'Individual' },
  { value: 'dobles', label: 'Dobles' },
  { value: 'pro_elite', label: 'Pro · Elite' },
];

interface Result {
  name: string;
  email: string;
  athlete_id: string | null;
  invite_url: string | null;
  error: string | null;
}

async function inviteOne(line: InviteLine, modality: Modality): Promise<Result> {
  try {
    const created = await apiJson<{ athlete: { id: string; full_name: string } }>('/api/coach/athletes', {
      method: 'POST',
      body: { full_name: line.name, email: line.email, modality },
    });
    const id = created.athlete.id;
    try {
      const inv = await apiJson<{ invite_url: string }>(`/api/coach/athletes/${id}/invite`, { method: 'POST' });
      return { name: line.name, email: line.email, athlete_id: id, invite_url: inv.invite_url, error: null };
    } catch (err) {
      return {
        name: line.name,
        email: line.email,
        athlete_id: id,
        invite_url: null,
        error: errorMessage(err, 'Está en tu lista, pero el enlace no se ha generado: pídelo desde su ficha.'),
      };
    }
  } catch (err) {
    return { name: line.name, email: line.email, athlete_id: null, invite_url: null, error: errorMessage(err, 'No se ha podido crear.') };
  }
}

export function InviteDialog({
  open,
  mode: initialMode,
  onClose,
  rows,
  levels,
  axisLabel,
  onInvited,
}: {
  open: boolean;
  mode: InviteMode;
  onClose: () => void;
  rows: readonly RosterRow[];
  levels: CoachLevel[];
  axisLabel: string;
  onInvited: () => void;
}) {
  const { toast } = useToast();
  const { groups } = useGroupOptions();
  const [mode, setMode] = useState<InviteMode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [text, setText] = useState('');
  const [levelId, setLevelId] = useState<string>(NONE);
  const [groupId, setGroupId] = useState<string>(NONE);
  const [modality, setModality] = useState<Modality>('individual');
  const [progress, setProgress] = useState<number | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const existing = useMemo(() => rows.map((r) => r.email ?? '').filter(Boolean), [rows]);
  const lines = useMemo(
    () => parseInviteList(mode === 'uno' ? (email.trim() ? `${name}, ${email}` : '') : text, existing),
    [mode, name, email, text, existing],
  );
  const ok = invitable(lines);
  const bad = lines.filter((l) => l.issue);

  const reset = () => {
    setName('');
    setEmail('');
    setText('');
    setResults(null);
    setProgress(null);
  };

  const run = async () => {
    setProgress(0);
    const out: Result[] = [];
    for (const line of ok) {
      out.push(await inviteOne(line, modality));
      setProgress(out.length);
    }
    const createdIds = out.filter((r) => r.athlete_id).map((r) => r.athlete_id!);
    const extra: string[] = [];
    if (createdIds.length > 0 && levelId !== NONE) {
      await runBulk({ action: 'set_level', athlete_ids: createdIds, level_id: levelId }).catch(() =>
        extra.push(`No se ha podido poner el ${axisLabel.toLocaleLowerCase('es')}.`),
      );
    }
    if (createdIds.length > 0 && groupId !== NONE) {
      await runBulk({ action: 'add_to_group', athlete_ids: createdIds, group_id: groupId, on_conflict: 'chain', delivery: 'auto' }).catch(() =>
        extra.push('No se ha podido añadir al grupo.'),
      );
    }
    setResults(out);
    setProgress(null);
    const n = createdIds.length;
    toast({
      title: n > 0 ? `${atletas(n)} ${n === 1 ? 'invitado' : 'invitados'}` : 'No se ha invitado a nadie',
      description: extra.length > 0 ? extra.join(' ') : undefined,
      tone: n > 0 && extra.length === 0 ? 'ok' : 'warn',
    });
    if (n > 0) onInvited();
  };

  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      toast({ title: 'No se ha podido copiar', description: 'Selecciona el enlace y cópialo a mano.', tone: 'warn' });
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setText(await f.text());
    setMode('lista');
  };

  const close = () => {
    reset();
    onClose();
  };

  const busy = progress != null;
  const title = results ? 'Enlaces de invitación' : mode === 'uno' ? 'Invitar atleta' : 'Importar lista';

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o || busy ? null : close())}
      size="md"
      title={title}
      description={
        results
          ? 'Envía a cada uno su enlace: con él activa su cuenta. Es de un solo uso.'
          : undefined
      }
      footer={
        results ? (
          <>
            {results.some((r) => r.invite_url) ? (
              <Button icon={copied === 'all' ? Check : Copy} onClick={() => void copy(linksText(results), 'all')}>
                {copied === 'all' ? 'Copiados' : 'Copiar todos'}
              </Button>
            ) : null}
            <Button variant="primary" onClick={close}>
              Hecho
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={close} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="primary" loading={busy} disabled={ok.length === 0} onClick={() => void run()}>
              {busy ? `Invitando ${progress} de ${ok.length}…` : ok.length > 1 ? `Invitar a ${ok.length}` : 'Invitar'}
            </Button>
          </>
        )
      }
    >
      {results ? (
        <ul className="flex flex-col divide-y divide-v2-border">
          {results.map((r) => (
            <li key={r.email} className="flex min-h-10 items-center gap-3 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="truncate t-body font-medium text-v2-fg">{r.name}</p>
                {r.error ? (
                  <p className="truncate t-meta text-v2-danger">{r.error}</p>
                ) : (
                  <p className="truncate t-meta text-v2-faint">{r.email}</p>
                )}
              </div>
              {r.invite_url ? (
                <Button size="sm" icon={copied === r.email ? Check : Copy} onClick={() => void copy(r.invite_url!, r.email)}>
                  {copied === r.email ? 'Copiado' : 'Copiar enlace'}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col gap-4">
          <SegmentedControl
            aria-label="Cómo"
            value={mode}
            onValueChange={setMode}
            items={[
              { value: 'uno', label: 'Uno' },
              { value: 'lista', label: 'Varios (lista o CSV)' },
            ]}
          />
          {mode === 'uno' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre y apellidos">
                {({ id }) => (
                  <Input id={id} size="lg" autoFocus value={name} maxLength={120} placeholder="Marta Ruiz" onChange={(e) => setName(e.target.value)} />
                )}
              </Field>
              <Field label="Email" error={email.trim() && lines[0]?.issue && lines[0].issue !== 'sin_nombre' ? INVITE_ISSUE_LABEL[lines[0].issue] : null}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    size="lg"
                    type="email"
                    value={email}
                    placeholder="marta@correo.com"
                    onChange={(e) => setEmail(e.target.value)}
                  />
                )}
              </Field>
            </div>
          ) : (
            <Field label="Una persona por línea: nombre, email" hint="Vale copiar de una hoja de cálculo o de tu correo.">
              {({ id, describedBy }) => (
                <div className="flex flex-col gap-2">
                  <Textarea
                    id={id}
                    aria-describedby={describedBy}
                    rows={6}
                    autoFocus
                    value={text}
                    placeholder={'Marta Ruiz, marta@correo.com\nJoan Ortega, joan@correo.com'}
                    onChange={(e) => setText(e.target.value)}
                    className="font-mono text-[13px]"
                  />
                  <div>
                    <Button size="sm" variant="ghost" icon={FileUp} onClick={() => file.current?.click()} className="-ml-2">
                      Subir CSV
                    </Button>
                    <input
                      ref={file}
                      type="file"
                      accept=".csv,.txt,text/csv,text/plain"
                      hidden
                      onChange={(e) => void onFile(e.target.files?.[0])}
                    />
                  </div>
                </div>
              )}
            </Field>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={axisLabel} optional>
              {({ id }) => (
                <Select
                  id={id}
                  size="lg"
                  value={levelId}
                  onValueChange={setLevelId}
                  options={[
                    { value: NONE, label: 'Sin asignar' },
                    ...levels.map((l) => ({ value: l.id, label: l.label && l.label !== l.name ? `${l.name} · ${l.label}` : l.name })),
                  ]}
                />
              )}
            </Field>
            <Field label="Grupo" optional>
              {({ id }) => (
                <Select
                  id={id}
                  size="lg"
                  value={groupId}
                  onValueChange={setGroupId}
                  options={[{ value: NONE, label: 'Sin grupo' }, ...(groups ?? []).map((g) => ({ value: g.id, label: g.label }))]}
                />
              )}
            </Field>
            <Field label="Modalidad">
              {({ id }) => (
                <Select id={id} size="lg" value={modality} onValueChange={setModality} options={MODALITIES} />
              )}
            </Field>
          </div>

          {mode === 'lista' && lines.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="t-body-sm text-v2-muted">
                <span className="font-semibold text-v2-fg t-tnum">{ok.length}</span> listos para invitar
                {bad.length > 0 ? <span className="t-tnum"> · {bad.length} con algo que revisar</span> : null}
              </p>
              <ul className="flex max-h-56 flex-col overflow-y-auto rounded-ctl border border-v2-border">
                {lines.map((l) => (
                  <li key={l.line} className="flex min-h-8 items-center gap-3 border-b border-v2-border px-3 py-1 last:border-b-0 t-body-sm">
                    <span className="w-6 shrink-0 text-right t-meta text-v2-faint t-tnum">{l.line}</span>
                    <span className="min-w-0 flex-1 truncate text-v2-fg">{l.name || '—'}</span>
                    <span className="min-w-0 flex-1 truncate text-v2-muted">{l.email || '—'}</span>
                    {l.issue ? (
                      <StatusBadge tone={l.issue === 'ya_en_tu_lista' ? 'neutral' : 'warn'} label={INVITE_ISSUE_LABEL[l.issue]} size="sm" />
                    ) : (
                      <StatusBadge tone="ok" label="Listo" size="sm" />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {mode === 'uno' && lines[0]?.issue === 'ya_en_tu_lista' ? (
            <p className="t-body-sm text-v2-muted">Ese email ya está en tu lista.</p>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
