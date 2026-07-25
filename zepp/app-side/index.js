import { BaseSideService } from '@zeppos/zml/base-side'

// El reloj NO puede hacer red directa en Zepp OS: TODA petición al backend de
// FAHYBRIK pasa por este Side Service (vive en la app Zepp del móvil). El reloj
// pide datos con this.request({method}); aquí respondemos con res(null, payload).
//
// Auth: el atleta inicia sesión desde la app de ajustes (email → código, reusa el
// login #41). El token queda en settingsStorage; aquí lo leemos para el Bearer.

const API_BASE = 'https://fahybrid.com'

/** getDay(): 0=Dom..6=Sáb → nuestro day_of_week 1=Lun..7=Dom. */
function todayDow() {
  const d = new Date().getDay()
  return d === 0 ? 7 : d
}

function readToken() {
  try {
    return settingsStorage.getItem('token') || ''
  } catch (e) {
    return ''
  }
}

async function getToday(res) {
  const token = readToken()
  if (!token) {
    res(null, { error: 'NO_AUTH' })
    return
  }
  try {
    const r = await fetch({
      url: `${API_BASE}/api/athlete/plan/week`,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = typeof r.body === 'string' ? JSON.parse(r.body) : r.body
    // La ruta devuelve { week, macro_summary, coach_name, target_race, next_race }
    // SIN envolver (jsonOk escribe el objeto tal cual). Los días cuelgan de `week`,
    // pero `coach_name` es de nivel superior porque es estable entre semanas.
    // Ver web/app/api/athlete/plan/week/route.ts.
    const root = body || {}
    const week = root.week || {}
    const dow = todayDow()
    const day = (week.days || []).find((x) => x.day_of_week === dow) || null

    res(null, {
      coach: root.coach_name || null,
      day: day
        ? {
            is_rest: !!day.is_rest,
            sessions: (day.sessions || []).map((s) => ({
              title: s.title || 'Entreno',
              blocks: typeof s.blocks_count === 'number' ? s.blocks_count : null,
              modality: s.modality || null,
            })),
          }
        : null,
    })
  } catch (e) {
    res(null, { error: 'FETCH_FAILED' })
  }
}

AppSideService(
  BaseSideService({
    onInit() {},

    onRequest(req, res) {
      if (req.method === 'GET_TODAY') return getToday(res)
      res(null, { error: 'UNKNOWN_METHOD' })
    },

    onRun() {},
    onDestroy() {},
  }),
)
