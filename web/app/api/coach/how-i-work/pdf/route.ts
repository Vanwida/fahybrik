// GET / POST / DELETE /api/coach/how-i-work/pdf
//
// PDF de método del coach. Scoped a session.coach_id. No es el cajón de papers:
// no se trocea ni se embebe. GET devuelve el fichero. POST reemplaza.

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  HOW_I_WORK_PDF_MAX_BYTES,
  HOW_I_WORK_PDF_MIME,
  validateHowIWorkPdf,
} from '@fahybrid/shared/domain/coach/how-i-work';
import {
  deleteHowIWorkPdf,
  getHowIWorkPdfBytes,
  putHowIWorkPdf,
} from '@/lib/coach/how-i-work';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PDF_ERROR_STATUS: Record<string, number> = {
  empty_file: 422,
  file_too_large: 413,
  unsupported_file_type: 415,
  invalid_pdf: 422,
};

const PDF_ERROR_MESSAGE: Record<string, string> = {
  empty_file: 'El fichero está vacío',
  file_too_large: `El PDF no puede superar ${HOW_I_WORK_PDF_MAX_BYTES} bytes`,
  unsupported_file_type: 'Solo se admite un PDF',
  invalid_pdf: 'El fichero no es un PDF',
};

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const file = await getHowIWorkPdfBytes(session.coach_id);
  if (!file) return jsonError('not_found', 'No hay PDF de método', 404);

  return new Response(Buffer.from(file.bytes), {
    status: 200,
    headers: {
      'content-type': file.mime || HOW_I_WORK_PDF_MIME,
      'content-disposition': contentDisposition(file.filename),
      'content-length': String(file.byte_size),
      'cache-control': 'private, no-store',
    },
  });
}

export async function POST(request: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError('invalid_form', 'No se pudo leer el formulario', 400);
  }

  const fileField = form.get('file');
  if (!(fileField instanceof File)) {
    return jsonError('missing_file', 'Falta el campo file', 400);
  }

  const bytes = new Uint8Array(await fileField.arrayBuffer());
  const checked = validateHowIWorkPdf({
    mime: fileField.type || '',
    byte_size: bytes.length,
    filename: fileField.name || 'metodo.pdf',
    bytes,
  });
  if (!checked.ok) {
    return jsonError(
      checked.code,
      PDF_ERROR_MESSAGE[checked.code] ?? 'PDF inválido',
      PDF_ERROR_STATUS[checked.code] ?? 422,
    );
  }

  const howIWork = await putHowIWorkPdf(session.coach_id, {
    filename: checked.filename,
    bytes,
    byte_size: bytes.length,
  });
  return jsonOk(howIWork, 201);
}

export async function DELETE() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const howIWork = await deleteHowIWorkPdf(session.coach_id);
  return jsonOk(howIWork);
}
