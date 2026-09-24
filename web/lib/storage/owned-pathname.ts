// De quién es un fichero del almacén, leído de su ruta. La ruta llega de fuera
// (un proxy comodín, un id de foto que manda el cliente), así que es la frontera
// de propiedad y se lee con UNA forma exacta, nunca «el segundo tramo de lo que
// venga»:
//
//     <raíz>/<id del dueño>/<aaaa>/<mm>/<fichero>
//
// Exactamente cinco tramos, sin tramos vacíos (nada de `//`), sin barra inicial
// (una ruta absoluta), sin `\`, sin `.` ni `..` (el fichero es un nombre con UNA
// extensión, sin más puntos). Así `chat/<mío>/../../chat/<suyo>/…` no pasa por
// ser «chat/<mío>». Pura: sin red ni BD.

const OWNER = /^\d{1,18}$/;
const YEAR = /^\d{4}$/;
const MONTH = /^\d{2}$/;
const FILE = /^[A-Za-z0-9_-]{1,128}\.[A-Za-z0-9]{1,8}$/;

/** El id del dueño de `pathname` si tiene la forma exacta bajo `root`; si no, null. */
export function ownerIdFromPathname(pathname: string, root: string): bigint | null {
  if (typeof pathname !== 'string' || pathname.length === 0 || pathname.length > 512) return null;
  if (pathname.startsWith('/') || pathname.includes('\\')) return null;
  const segments = pathname.split('/');
  if (segments.length !== 5) return null;
  const [head, owner, yyyy, mm, file] = segments as [string, string, string, string, string];
  if (head !== root) return null;
  if (!OWNER.test(owner) || !YEAR.test(yyyy) || !MONTH.test(mm) || !FILE.test(file)) return null;
  const id = BigInt(owner);
  return id > BigInt(0) ? id : null;
}
