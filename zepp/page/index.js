import * as hmUI from '@zos/ui'
import { getDeviceInfo } from '@zos/device'
import { BasePage } from '@zeppos/zml/base-page'

// UI del reloj. No hace red: pide el entreno de hoy al Side Service del móvil con
// this.request({method:'GET_TODAY'}) y pinta lo que devuelve. Geometría por
// fracciones del ancho/alto → vale en cualquier Amazfit sin depender de px().

const { width: W, height: H } = getDeviceInfo()
const WHITE = 0xffffff
const MUTED = 0x9a9a9a
const r = (n) => Math.round(n)

Page(
  BasePage({
    state: { body: null },

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
        text: 'Cargando tu entreno…',
        text_size: r(H * 0.058),
        color: MUTED,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.TOP,
        text_style: hmUI.text_style.WRAP,
      })

      this.loadToday()
    },

    setBody(text, color) {
      this.state.body.setProperty(hmUI.prop.MORE, { text, color: color || MUTED })
    },

    loadToday() {
      this.request({ method: 'GET_TODAY' })
        .then((data) => this.render(data))
        .catch(() => this.setBody('Sin conexión con el móvil', MUTED))
    },

    render(data) {
      if (!data || data.error === 'FETCH_FAILED') return this.setBody('No se pudo cargar', MUTED)
      if (data.error === 'NO_AUTH')
        return this.setBody('Entra desde la app Zepp → Ajustes de FAHYBRIK', MUTED)
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
