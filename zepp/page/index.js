import * as hmUI from '@zos/ui'
import { getDeviceInfo } from '@zos/device'
import { BasePage } from '@zeppos/zml/base-page'

// UI del reloj. No hace red: pide el entreno de hoy al Side Service del móvil con
// this.request({method:'GET_TODAY'}) y pinta lo que devuelve. Geometría por
// fracciones del ancho/alto → vale en cualquier Amazfit sin depender de px().

// DEMO: el simulador NO puede ejecutar el side-service (limitación conocida de
// Zepp). Con DEMO=true la pantalla pinta un entreno de EJEMPLO para poder ver el
// diseño en el simulador. En producción va SIEMPRE en false (datos reales).
const DEMO = false
const DEMO_DATA = {
  day: {
    is_rest: false,
    sessions: [
      { title: 'Fuerza principal', blocks: 3 },
      { title: 'Metcon', blocks: 1 },
    ],
  },
}

const { width: W, height: H } = getDeviceInfo()
const WHITE = 0xffffff
const MUTED = 0x9a9a9a
const r = (n) => Math.round(n)
const REQUEST_TIMEOUT_MS = 5000

Page(
  BasePage({
    state: { body: null, done: false },

    build() {
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: 0,
        y: r(H * 0.08),
        w: W,
        h: r(H * 0.12),
        text: 'HOY',
        text_size: r(H * 0.075),
        color: WHITE,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
      })

      this.state.body = hmUI.createWidget(hmUI.widget.TEXT, {
        x: r(W * 0.08),
        y: r(H * 0.24),
        w: r(W * 0.84),
        h: r(H * 0.66),
        text: DEMO ? '' : 'Cargando tu entreno…',
        text_size: r(H * 0.058),
        color: MUTED,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.TOP,
        text_style: hmUI.text_style.WRAP,
      })

      if (DEMO) {
        this.render(DEMO_DATA)
        return
      }
      this.loadToday()
    },

    setBody(text, color) {
      this.state.body.setProperty(hmUI.prop.MORE, { text, color: color || MUTED })
    },

    // Pide el entreno al side-service CON timeout: si el móvil no responde (móvil
    // apagado, fuera de rango, o el simulador que no ejecuta el side-service), no
    // se queda colgado en "Cargando…" — muestra el estado honesto de sin conexión.
    loadToday() {
      const timer = setTimeout(() => {
        if (this.state.done) return
        this.state.done = true
        this.setBody('Sin conexión con el móvil', MUTED)
      }, REQUEST_TIMEOUT_MS)

      this.request({ method: 'GET_TODAY' })
        .then((data) => {
          if (this.state.done) return
          this.state.done = true
          clearTimeout(timer)
          this.render(data)
        })
        .catch(() => {
          if (this.state.done) return
          this.state.done = true
          clearTimeout(timer)
          this.setBody('Sin conexión con el móvil', MUTED)
        })
    },

    render(data) {
      if (!data || data.error === 'FETCH_FAILED') return this.setBody('No se pudo cargar', MUTED)
      if (data.error === 'NO_AUTH')
        return this.setBody('Entra desde la app Zepp → Ajustes de FAHYBRID', MUTED)
      if (data.error) return this.setBody('No se pudo cargar', MUTED)
      if (!data.day) return this.setBody('No tienes entreno esta semana', MUTED)
      if (data.day.is_rest) return this.setBody('Descanso', WHITE)

      const lines = (data.day.sessions || []).map((s) =>
        s.blocks ? `${s.title}\n${s.blocks} bloques` : s.title,
      )
      this.setBody(lines.join('\n\n') || 'Sin sesiones hoy', WHITE)
    },
  }),
)
