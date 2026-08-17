-- 0197_coach_how_i_work.sql
--
-- CÓMO TRABAJA EL COACH (docs/metodologia-coach.html).
--
-- Texto suyo y/o su PDF de método. Una fila por coach. Sin fila = vacío =
-- no imitar. Sin defaults de columna: no hay escuela de producto que
-- rellenar. No toca coach_methodology (0048, 37 columnas muertas) ni el
-- cajón de papers (methodology_documents).
--
-- Aditivo. Idempotente. El runner envuelve el fichero en UNA transaccion
-- (sin begin/commit aqui) y corta por punto y coma, asi que ningun
-- comentario lleva uno.

create table if not exists coach_how_i_work (
  id               bigint      generated always as identity primary key,
  coach_id         bigint      not null references coaches(id) on delete cascade,
  body_text        text,
  pdf_filename     text,
  pdf_mime         text,
  pdf_bytes        bytea,
  pdf_byte_size    integer,
  pdf_uploaded_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint coach_how_i_work_coach_uq unique (coach_id),
  constraint coach_how_i_work_body_len_chk
    check (body_text is null or char_length(body_text) <= 8000),
  constraint coach_how_i_work_pdf_all_or_none_chk check (
    (
      pdf_filename is null
      and pdf_mime is null
      and pdf_bytes is null
      and pdf_byte_size is null
      and pdf_uploaded_at is null
    )
    or (
      pdf_filename is not null
      and pdf_mime = 'application/pdf'
      and pdf_bytes is not null
      and pdf_byte_size > 0
      and pdf_uploaded_at is not null
    )
  )
);

comment on table coach_how_i_work is
  'Como trabaja el coach: texto y/o PDF de metodo. Sin fila = vacio = no imitar. No es el cajon de papers.';
