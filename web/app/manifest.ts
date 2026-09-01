import type { MetadataRoute } from 'next';

// Manifest PWA — lo que hace instalable el dashboard del coach. El icono es la
// variante COACH (banda naranja) para que en la pantalla de inicio no se
// confunda con la app nativa del atleta. start_url sin locale: el middleware
// redirige a /es/hoy al abrir.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FAHYBRID Coach',
    short_name: 'FH Coach',
    description: 'El dashboard del coach: mensajes, atletas y el día a día.',
    start_url: '/atletas',
    scope: '/',
    display: 'standalone',
    background_color: '#F1EFEB',
    theme_color: '#F1EFEB',
    icons: [
      { src: '/brand/fh-coach-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/fh-coach-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/brand/fh-coach-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/brand/fh-coach-1024.png', sizes: '1024x1024', type: 'image/png' },
    ],
  };
}
