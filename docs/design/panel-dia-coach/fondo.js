// Fondo: la ficha del atleta con la semana, atenuada, y la cabecera del panel.
// Solo texto real: cromo que ya existe en el panel (pestañas, «Descanso», «Hoy»,
// «Pendiente») y el título del jueves. El resto de días van como barras, no como
// nombres inventados.

const DIAS = [
  { d: 'LUN', n: 24, tipo: 'barras' },
  { d: 'MAR', n: 25, tipo: 'barras', hoy: true },
  { d: 'MIÉ', n: 26, tipo: 'descanso' },
  { d: 'JUE', n: 27, tipo: 'sel' },
  { d: 'VIE', n: 28, tipo: 'barras' },
  { d: 'SÁB', n: 29, tipo: 'barras' },
  { d: 'DOM', n: 30, tipo: 'descanso' },
];

function cuerpoDia(dia) {
  if (dia.tipo === 'descanso') return '<span class="descanso">Descanso</span>';
  if (dia.tipo === 'sel') {
    return `<div class="sesion-sel">
        <span class="mod"><i class="punto mod-fuerza"></i><span class="micro" style="font-size:10px">Fuerza</span></span>
        <b>Fuerza B + Trineos</b>
      </div>`;
  }
  return '<div class="barra media"></div><div class="barra corta"></div>';
}

document.getElementById('fondo').innerHTML = `
  <div class="topbar">
    <div class="marca"></div>
    <nav class="nav"><span>Hoy</span><span class="on">Atletas</span><span>Mensajes</span><span>Pagos</span><span>Métricas</span></nav>
  </div>
  <div class="pagina">
    <div class="ficha-h">
      <div class="avatar">A</div>
      <h1>Alex</h1>
    </div>
    <div class="tabs">
      <span>Resumen</span><span class="on">Plan</span><span>Rendimiento</span><span>Del coach</span><span>Atleta</span>
    </div>
    <div class="semana">
      <div class="semana-h"><b>24 – 30 ago</b><span class="micro">2026</span></div>
      <div class="dias">
        ${DIAS.map(
          (dia) => `
          <div class="dia ${dia.tipo === 'descanso' ? 'vacio' : ''} ${dia.tipo === 'sel' ? 'sel' : ''}">
            <div class="dia-h"><span class="micro">${dia.d} ${dia.n}</span></div>
            <div class="dia-b">${cuerpoDia(dia)}</div>
          </div>`,
        ).join('')}
      </div>
    </div>
  </div>`;

document.getElementById('panel-h').innerHTML = `
  <div>
    <h2>Fuerza B + Trineos</h2>
    <div class="meta">
      <span class="pill">Pendiente</span>
      <span class="fecha">2026-08-27</span>
    </div>
  </div>
  <div class="cerrar">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M6 6l12 12M18 6L6 18"/>
    </svg>
  </div>`;
