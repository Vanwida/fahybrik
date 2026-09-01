// App de AJUSTES (vive en la app Zepp del móvil). Login del atleta por email +
// código de 6 dígitos — reusa el login #41 de FAHYBRID (endpoints ya vivos):
//   POST /api/auth/email/request  { email }            → envía el código
//   POST /api/auth/email/verify   { email, code }      → devuelve el token
// El token se guarda en settingsStorage y el Side Service lo lee para el Bearer.
//
// Nota: la firma exacta de fetch en el entorno de settings se confirma al probar
// en la app Zepp; el flujo y los endpoints son los reales.

const API_BASE = 'https://fahybrid.com'

AppSettingsPage({
  state: { email: '', code: '', status: '' },

  setStatus(props, status) {
    this.setState({ ...this.state, status })
    props.settingsStorage.setItem('status', status)
  },

  async sendCode(props) {
    if (!this.state.email) return this.setStatus(props, 'Escribe tu email')
    this.setStatus(props, 'Enviando código…')
    try {
      await fetch(`${API_BASE}/api/auth/email/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: this.state.email }),
      })
      this.setStatus(props, 'Código enviado — revisa tu email')
    } catch (e) {
      this.setStatus(props, 'No se pudo enviar el código')
    }
  },

  async verify(props) {
    if (!/^\d{6}$/.test(this.state.code)) return this.setStatus(props, 'El código son 6 dígitos')
    this.setStatus(props, 'Comprobando…')
    try {
      const res = await fetch(`${API_BASE}/api/auth/email/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: this.state.email, code: this.state.code }),
      })
      const body = await res.json()
      // /api/auth/email/verify devuelve `session_token` en el nivel superior
      // (jsonOk NO envuelve en { data }). Ver web/app/api/auth/email/verify/route.ts.
      const token = (body && body.session_token) || ''
      if (!token) return this.setStatus(props, 'Código incorrecto o caducado')
      props.settingsStorage.setItem('token', token)
      this.setStatus(props, '✓ Conectado')
    } catch (e) {
      this.setStatus(props, 'No se pudo verificar')
    }
  },

  build(props) {
    const connected = !!props.settingsStorage.getItem('token')
    return View(
      { style: { padding: '16px' } },
      [
        // La marca es FAHYBRID. `FAHYBRIK` es el nombre heredado del repo y no se
        // escribe donde lo lee el atleta: esta pantalla vive en la app Zepp de su
        // móvil. Mismo nombre que app.json (`appName`) y que la app del iPhone.
        Text({ style: { fontSize: '20px', fontWeight: 'bold', marginBottom: '4px' } }, 'FAHYBRID · Reloj'),
        Text(
          { style: { fontSize: '13px', color: '#888', marginBottom: '16px' } },
          connected
            ? 'Conectado. El reloj mostrará tu entreno de hoy.'
            : 'Entra con tu email para ver tu entreno en el reloj.',
        ),
        TextInput({
          label: 'Email',
          value: this.state.email,
          onChange: (val) => this.setState({ ...this.state, email: val }),
        }),
        Button({ label: 'Enviar código', onClick: () => this.sendCode(props) }),
        TextInput({
          label: 'Código (6 dígitos)',
          value: this.state.code,
          onChange: (val) => this.setState({ ...this.state, code: val }),
        }),
        Button({ label: connected ? 'Volver a entrar' : 'Entrar', onClick: () => this.verify(props) }),
        this.state.status
          ? Text({ style: { fontSize: '13px', color: '#111', marginTop: '12px' } }, this.state.status)
          : null,
      ],
    )
  },
})
