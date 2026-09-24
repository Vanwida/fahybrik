'use client';

// Convertir un lead en atleta (#5). Tres estados:
//   · ya convertido → enlace a su ficha;
//   · alta enviada  → «Reenviar» + cuándo se envió (pendiente de que la reclame);
//   · lead vivo     → «Convertir en atleta» abre el formulario pre-rellenado.
// POST /api/coach/leads/[id]/alta crea el atleta, genera la invitación y le
// escribe. El lead pasa a «Convertido» cuando el atleta la canjea, no aquí.

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, UserPlus } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import {
  Button,
  Checkbox,
  Dialog,
  Field,
  Input,
  SegmentedControl,
  Select,
  StatusBadge,
  Textarea,
  buttonVariants,
} from '@/components/v2/ui';
import type { AltaPrefill } from '@/lib/leads/alta-mapping';
import type { CoachLevelOption } from '@/lib/dashboard/coach/leads';
import type { LeadStatus } from '@/lib/dashboard/coach/leads-status';

interface AltaState {
  sent_at: string | null;
  converted_athlete_id: string | null;
  prefill: AltaPrefill;
}

const SEX_OPTIONS: Array<{ value: 'male' | 'female' | 'other'; label: string }> = [
  { value: 'male', label: 'Hombre' },
  { value: 'female', label: 'Mujer' },
  { value: 'other', label: 'Otro / prefiere no decir' },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function LeadAltaControl({
  leadId,
  status,
  alta,
  levels,
  axisLabel,
  stripeConfigured = false,
}: {
  leadId: string;
  status: LeadStatus;
  alta: AltaState;
  levels: CoachLevelOption[];
  /** Cómo llama el coach a su clasificación («Nivel» por defecto). */
  axisLabel: string;
  stripeConfigured?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (alta.converted_athlete_id) {
    return (
      <Link href={`/atletas/${alta.converted_athlete_id}`} className={buttonVariants({ variant: 'secondary' })}>
        Ver su ficha de atleta
      </Link>
    );
  }

  const terminal = status === 'descartado';
  return (
    <>
      <Button variant="primary" icon={UserPlus} disabled={terminal} onClick={() => setOpen(true)}>
        {alta.sent_at ? 'Reenviar invitación' : 'Convertir en atleta'}
      </Button>
      {alta.sent_at ? (
        <StatusBadge tone="info" size="sm" label={`Invitación enviada el ${formatDate(alta.sent_at)} · sin canjear`} />
      ) : null}
      {open ? (
        <AltaDialog
          leadId={leadId}
          prefill={alta.prefill}
          levels={levels}
          axisLabel={axisLabel}
          stripeConfigured={stripeConfigured}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function AltaDialog({
  leadId,
  prefill,
  levels,
  axisLabel,
  stripeConfigured,
  onClose,
}: {
  leadId: string;
  prefill: AltaPrefill;
  levels: CoachLevelOption[];
  axisLabel: string;
  stripeConfigured: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const defaultLevelId = levels.find((l) => l.name === prefill.level_name)?.id ?? '';

  const [fullName, setFullName] = useState(prefill.full_name);
  const [email, setEmail] = useState(prefill.email);
  const [edad, setEdad] = useState(prefill.edad != null ? String(prefill.edad) : '');
  const [sex, setSex] = useState<string>(prefill.sex ?? '');
  const [days, setDays] = useState(
    prefill.training_days_per_week != null ? String(prefill.training_days_per_week) : '',
  );
  const [levelId, setLevelId] = useState(defaultLevelId);
  const [modality, setModality] = useState<'individual' | 'dobles'>(
    prefill.modality === 'dobles' ? 'dobles' : 'individual',
  );
  const [notes, setNotes] = useState(prefill.notes);
  // #15 — billing. Default to cobro (stripe); the price pre-fills from the last
  // sales call's quote when there is one. Cortesía toggles off the cobro entirely.
  const pricePrefilled = prefill.quoted_price_eur != null;
  // When Stripe billing isn't configured in this env, the cobro path can't run,
  // so start (and lock) on cortesía — the coach never hits a checkout error.
  const [cortesia, setCortesia] = useState(!stripeConfigured);
  const [price, setPrice] = useState(pricePrefilled ? String(prefill.quoted_price_eur) : '');
  // Plan FUNDADOR: cobro por Stripe con el cupón FUNDADOR (0 €/mes, sin tarjeta);
  // se guarda igualmente el precio de lista. Solo aplica cuando hay cobro.
  const [founder, setFounder] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ inviteUrl: string; emailSent: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const close = () => {
    if (done) startTransition(() => router.refresh());
    onClose();
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    // Billing: cortesía = no cobro; fundador = 0 € por Stripe (precio opcional);
    // cobro normal = precio mensual positivo obligatorio.
    const priceValue = Number(price);
    const priceValid = price.trim() !== '' && Number.isFinite(priceValue) && priceValue > 0;
    if (!cortesia && !founder && !priceValid) {
      setError('Pon el precio mensual, o marca cortesía o fundador.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/coach/leads/${leadId}/alta`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          edad: edad.trim() ? Number(edad) : null,
          sex: sex || null,
          training_days_per_week: days.trim() ? Number(days) : null,
          level_id: levelId ? Number(levelId) : null,
          modality,
          notes: notes.trim(),
          ...(cortesia
            ? { billing: 'comp' as const }
            : {
                billing: 'stripe' as const,
                founder,
                // El precio de lista es opcional en Fundador — solo se envía si es válido.
                ...(priceValid ? { agreed_price_eur: priceValue } : {}),
              }),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; alta?: { invite_url: string; email_sent: boolean }; error?: { message?: string } }
        | null;
      if (!res.ok || !data?.alta) {
        setError(data?.error?.message ?? 'No se ha podido convertir en atleta.');
        return;
      }
      setDone({ inviteUrl: data.alta.invite_url, emailSent: data.alta.email_sent });
    } catch {
      setError('Sin conexión. No se ha convertido.');
    } finally {
      setSubmitting(false);
    }
  }

  const formId = useId();
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) close();
      }}
      title="Convertir en atleta"
      description={done ? undefined : 'Sale de lo que contestó en tu formulario. Ajusta lo que haga falta; le llega un correo para bajarse la app.'}
      footer={
        done ? (
          <Button variant="primary" onClick={close}>
            Hecho
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form={formId} loading={submitting}>
              Convertir y enviar invitación
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="flex flex-col gap-3">
          <StatusBadge
            tone="ok"
            label={done.emailSent ? 'Atleta creado. Le hemos enviado la invitación.' : 'Atleta creado. Envíale tú el enlace.'}
          />
          <Field label="Enlace de invitación">
            {({ id }) => (
              <div className="flex items-center gap-2">
                <Input id={id} readOnly value={done.inviteUrl} size="lg" />
                <Button
                  icon={copied ? Check : Copy}
                  onClick={() => {
                    void navigator.clipboard?.writeText(done.inviteUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
            )}
          </Field>
        </div>
      ) : (
        <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Nombre y apellidos">
            {({ id }) => <Input id={id} size="lg" required value={fullName} onChange={(e) => setFullName(e.target.value)} />}
          </Field>
          <Field label="Correo">
            {({ id }) => <Input id={id} size="lg" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Edad" optional>
              {({ id }) => (
                <Input id={id} size="lg" inputMode="numeric" value={edad} onChange={(e) => setEdad(e.target.value)} />
              )}
            </Field>
            <Field label="Días por semana" optional>
              {({ id }) => (
                <Input id={id} size="lg" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
              )}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sexo" optional>
              {({ id }) => (
                <Select
                  id={id}
                  size="lg"
                  value={sex || null}
                  placeholder="Sin indicar"
                  onValueChange={(v) => setSex(v)}
                  options={SEX_OPTIONS.map((o) => ({ value: o.value as string, label: o.label }))}
                />
              )}
            </Field>
            <Field label={axisLabel} optional>
              {({ id }) => (
                <Select
                  id={id}
                  size="lg"
                  value={levelId || null}
                  placeholder={levels.length === 0 ? 'Aún no has creado ninguno' : 'Sin asignar'}
                  disabled={levels.length === 0}
                  onValueChange={(v) => setLevelId(v)}
                  options={levels.map((l) => ({ value: l.id, label: l.label ? `${l.name} · ${l.label}` : l.name }))}
                />
              )}
            </Field>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="t-meta text-v2-muted">Modalidad</span>
            <SegmentedControl
              aria-label="Modalidad"
              items={[
                { value: 'individual', label: 'Individual' },
                { value: 'dobles', label: 'Dobles' },
              ]}
              value={modality}
              onValueChange={setModality}
              className="w-fit"
            />
          </div>

          <fieldset className="flex flex-col gap-3 rounded-panel border border-v2-border p-3">
            <legend className="px-1 t-meta text-v2-muted">Cobro</legend>
            <Checkbox
              checked={cortesia}
              disabled={!stripeConfigured}
              onCheckedChange={setCortesia}
              label="Cortesía: acceso sin cobro"
            />
            {!stripeConfigured ? (
              <p className="t-body-sm text-v2-muted">El cobro con tarjeta aún no está conectado; de momento, cortesía.</p>
            ) : cortesia ? null : (
              <>
                <Checkbox checked={founder} onCheckedChange={setFounder} label="Fundador: suscripción real a 0 €/mes, sin tarjeta" />
                <Field
                  label={founder ? 'Precio de lista (opcional)' : 'Precio acordado'}
                  hint={founder ? 'No se cobra; sirve para tus cuentas y para el día que deje de ser fundador.' : pricePrefilled ? 'Del parte de la llamada.' : undefined}
                >
                  {({ id, describedBy }) => (
                    <Input
                      id={id}
                      size="lg"
                      inputMode="decimal"
                      value={price}
                      aria-describedby={describedBy}
                      onChange={(e) => setPrice(e.target.value)}
                      trailing="€/mes"
                      className="w-44"
                    />
                  )}
                </Field>
              </>
            )}
          </fieldset>

          <Field label="Notas para ti" optional>
            {({ id }) => <Textarea id={id} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />}
          </Field>

          {error ? (
            <p role="alert" className="t-body-sm text-v2-danger">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </Dialog>
  );
}
