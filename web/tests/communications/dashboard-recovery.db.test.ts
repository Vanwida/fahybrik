import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeFreeAthlete, type Fixture, type FreeAthleteFixture } from '../utils/db-fixtures';
import { createCommunication, deleteCommunication, getCommunication, listCommunications, listCommunicationsForAthlete, updateCommunication } from '@/lib/coach/communications';
import { publishCommunication } from '@/lib/coach/communications-publish';
import { answerCommunication, listAthleteCommunications, setCommunicationItemMark } from '@/lib/athlete/communications';
import { audioProxyUrl } from '@/lib/communications/audio';
import { aInput, desdeComunicado } from '@/lib/dashboard/v2/del-coach-borrador';
import { loadFichaTimeline } from '@/lib/dashboard/v2/ficha-timeline';
import { createCommunicationSchema } from '@fahybrid/shared/domain/coach-communications';

describeWithDb('dashboard: recuperar y reutilizar comunicados (DB real)', () => {
  const sql = getTestSql();
  let own: Fixture;
  let other: Fixture;
  let neighbor: FreeAthleteFixture;
  const create = (raw: unknown) => createCommunication({ coach_id: own.coachId, input: createCommunicationSchema.parse(raw), sql });
  const delivery = (id: string, athleteId = own.athleteId, coachId = own.coachId) => listCommunicationsForAthlete({ coach_id: coachId, athlete_id: athleteId, communication_id: id, sql });

  beforeAll(async () => {
    own = await makeCoachAndAthlete(sql);
    other = await makeCoachAndAthlete(sql);
    neighbor = await makeFreeAthlete(sql);
    await sql`update athletes set coach_id = ${own.coachId} where id = ${neighbor.athleteId}`;
  }, 90_000);

  afterAll(async () => {
    if (own) await sql`delete from coach_communications where coach_id = ${own.coachId}`;
    const userIds = [own?.athleteUserId, own?.coachUserId, other?.athleteUserId, other?.coachUserId, neighbor?.athleteUserId].filter((id): id is number => id != null);
    if (userIds.length) await sql`delete from notifications where user_id = any(${userIds}::bigint[])`;
    if (neighbor) await neighbor.cleanup();
    if (own) await own.cleanup();
    if (other) await other.cleanup();
    await closeTestSql();
  }, 90_000);

  it('la plantilla se edita y publica como copia sin cambiar el molde', async () => {
    const template = await create({ kind: 'focus', title: 'Plantilla', body: 'Comer antes de entrenar', is_template: true });
    const edited = await updateCommunication({ coach_id: own.coachId, id: template.id, input: createCommunicationSchema.parse({ kind: 'focus', title: 'Plantilla corregida', body: 'Comer dos horas antes', is_template: true }), sql });
    const draft = desdeComunicado(edited);
    draft.title = 'Foco personalizado';
    const copy = await createCommunication({ coach_id: own.coachId, input: aInput(draft, false), sql });
    await publishCommunication({ coach_id: own.coachId, id: copy.id, athlete_ids: [own.athleteId, neighbor.athleteId], sql });
    expect(copy.id).not.toBe(template.id);
    expect((await getCommunication({ coach_id: own.coachId, id: template.id, sql }))).toMatchObject({ title: 'Plantilla corregida', is_template: true, status: 'draft', tracking: { recipients: 0 } });
    expect((await delivery(copy.id))[0]).toMatchObject({ title: 'Foco personalizado', tracking: { recipients: 2 } });
  }, 30_000);

  it('retomar un borrador y publicarlo conserva su id y lo quita de Sin publicar', async () => {
    const draft = await create({ kind: 'task', title: 'Revisar técnica', due_date: '2026-10-08', body: 'Graba una serie' });
    const b = desdeComunicado(draft);
    b.body = 'Graba dos series';
    await updateCommunication({ coach_id: own.coachId, id: draft.id, input: aInput(b, false), sql });
    await publishCommunication({ coach_id: own.coachId, id: draft.id, athlete_ids: [own.athleteId], sql });
    expect((await delivery(draft.id))[0]).toMatchObject({ id: draft.id, body: 'Graba dos series', due_date: '2026-10-08' });
    expect((await listCommunications({ coach_id: own.coachId, view: 'drafts', sql })).map((c) => c.id)).not.toContain(draft.id);
  }, 30_000);

  it('una publicación a varios separa la opción escogida de cada atleta y conserva contenido y audio', async () => {
    const audio = audioProxyUrl(`comunicados/${own.coachId}/2026/10/recovery.wav`);
    const question = await create({ kind: 'question', title: 'Elegir sesión', body: 'Qué puedes hacer mañana', audio_url: audio, audio_seconds: 12, items: [{ content: 'Correr', consequence: 'Se mantiene el plan' }, { content: 'Bici', consequence: 'Se adapta la sesión' }] });
    await publishCommunication({ coach_id: own.coachId, id: question.id, athlete_ids: [own.athleteId, neighbor.athleteId], sql });
    await answerCommunication({ athlete_id: own.athleteId, communication_id: question.id, item_id: question.items[1]!.id, sql });
    const [mine] = await delivery(question.id);
    const [neighborDelivery] = await delivery(question.id, neighbor.athleteId);
    expect(mine).toMatchObject({ body: 'Qué puedes hacer mañana', audio_url: audio, audio_seconds: 12, athlete_state: { state: 'answered', answered_item_id: question.items[1]!.id } });
    expect(mine!.items.find((i) => i.id === mine!.athlete_state.answered_item_id)).toMatchObject({ content: 'Bici', consequence: 'Se adapta la sesión' });
    expect(neighborDelivery!.athlete_state.answered_item_id).toBeNull();
    await deleteCommunication({ coach_id: own.coachId, id: question.id, sql });
    expect((await delivery(question.id))[0]).toMatchObject({ status: 'archived', athlete_state: { answered_item_id: question.items[1]!.id }, audio_url: audio });
    expect((await listAthleteCommunications({ athlete_id: neighbor.athleteId, sql })).map((c) => c.id)).not.toContain(question.id);
  }, 30_000);

  it('retirar conserva los pasos y sus marcas y el historial abre el comunicado real', async () => {
    const protocol = await create({ kind: 'protocol', title: 'Calentamiento', final_note: 'Escríbeme si duele', items: [{ content: 'Movilidad', checkable: true }, { content: 'Lee el briefing', checkable: false }] });
    await publishCommunication({ coach_id: own.coachId, id: protocol.id, athlete_ids: [own.athleteId], sql });
    await setCommunicationItemMark({ athlete_id: own.athleteId, communication_id: protocol.id, item_id: protocol.items[0]!.id, done: true, sql });
    await deleteCommunication({ coach_id: own.coachId, id: protocol.id, sql });
    const [detail] = await delivery(protocol.id);
    expect(detail!.items.map((item) => item.checkable)).toEqual([true, false]);
    expect(detail).toMatchObject({ status: 'archived', final_note: 'Escríbeme si duele', athlete_state: { marked_item_ids: [protocol.items[0]!.id] } });
    const timeline = await loadFichaTimeline({ coach_id: own.coachId, athlete_id: own.athleteId, client: sql });
    expect(timeline.find((entry) => entry.communication_id === protocol.id)).toMatchObject({ kind: 'comunicado', detail: expect.stringContaining('Retirado') });
  }, 30_000);

  it('el detalle nunca devuelve un borrador, un no destinatario ni otro coach', async () => {
    const draft = await create({ kind: 'focus', title: 'Privado', body: 'Borrador del coach' });
    expect(await delivery(draft.id)).toEqual([]);
    await publishCommunication({ coach_id: own.coachId, id: draft.id, athlete_ids: [own.athleteId], sql });
    expect(await delivery(draft.id, neighbor.athleteId)).toEqual([]);
    expect(await delivery(draft.id, other.athleteId, other.coachId)).toEqual([]);
    await expect(delivery(draft.id, own.athleteId, other.coachId)).rejects.toMatchObject({ code: 'not_found', status: 404 });
  }, 30_000);

  it('eliminar una plantilla deja su copia publicada intacta', async () => {
    const template = await create({ kind: 'focus', title: 'Molde borrable', body: 'Prioriza dormir', is_template: true });
    const copy = await createCommunication({ coach_id: own.coachId, input: aInput(desdeComunicado(template), false), sql });
    await publishCommunication({ coach_id: own.coachId, id: copy.id, athlete_ids: [own.athleteId], sql });
    expect(await deleteCommunication({ coach_id: own.coachId, id: template.id, sql })).toMatchObject({ outcome: 'deleted' });
    await expect(getCommunication({ coach_id: own.coachId, id: template.id, sql })).rejects.toMatchObject({ status: 404 });
    expect((await delivery(copy.id))[0]).toMatchObject({ body: 'Prioriza dormir', status: 'published' });
  }, 30_000);
});
