// POST /api/coach/cobros/[athlete_id]/marcar-cobrado
//
// El atleta ha pagado por otra vía (transferencia, efectivo): la factura
// abierta se marca pagada FUERA de Stripe (`paid_out_of_band`), así Stripe deja
// de reintentar el cobro y la suscripción vuelve a estar al día. No se cobra
// nada a la tarjeta. Solo el coach dueño del atleta y con Negocio.
//   200 { stripe_invoice_id } · 404 no es tuyo · 409 sin factura abierta ·
//   503 sin Stripe configurado.

import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { negocioForbidden } from '@/lib/coach/negocio-gate';
import { findOpenInvoice, markInvoicePaidLocally } from '@/lib/coach/cobros';
import { gatedResponse, getStripeOrThrow, loadStripeConfig } from '@/lib/stripe';
import { captureRouteError } from '@/lib/observability/capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ athlete_id: z.string().regex(/^\d+$/) });

export async function POST(_req: Request, ctx: { params: Promise<{ athlete_id: string }> }) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);
  const noNegocio = await negocioForbidden(session.coach_id);
  if (noNegocio) return noNegocio;
  const parsed = paramsSchema.safeParse(await ctx.params);
  if (!parsed.success) return jsonError('bad_request', 'Atleta no válido', 400);

  const { owned, invoice } = await findOpenInvoice(session.coach_id, BigInt(parsed.data.athlete_id));
  if (!owned) return jsonError('not_found', 'Atleta no encontrado', 404);
  if (!invoice) return jsonError('conflict', 'No tiene ningún cobro pendiente en Stripe.', 409);

  const cfg = loadStripeConfig();
  if (!cfg.ok) return gatedResponse(cfg.missing);

  try {
    const { stripe } = getStripeOrThrow();
    await stripe.invoices.pay(invoice.stripe_invoice_id, { paid_out_of_band: true });
    await markInvoicePaidLocally(invoice.stripe_invoice_id);
    return jsonOk({ stripe_invoice_id: invoice.stripe_invoice_id });
  } catch (err) {
    captureRouteError(err, { route: 'api/coach/cobros/marcar-cobrado.POST' });
    return jsonError('stripe_error', 'Stripe no ha aceptado el cambio. Prueba desde su panel.', 502);
  }
}
