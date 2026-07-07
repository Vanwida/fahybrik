-- #14 refine — outcome naming. "convertido" collided with the lead STATUS `convertido`
-- (which is earned when the athlete claims the account, not on the call). The call
-- outcome is INTENT; conversion is real. Metrics (#20) measure them separately. Rename
-- the enum labels (rows keep their value under the new name — no data change).
--
-- Also: retire appointments.coach_note in favour of session_reports (the 1:1 parte). The
-- column stays for historical compatibility; it is no longer written or read.

alter type session_report_outcome rename value 'convertido' to 'quiere_empezar';
alter type session_report_outcome rename value 'pensandolo'  to 'pensandoselo';
alter type session_report_outcome rename value 'no'          to 'no_interesado';
alter type session_report_outcome rename value 'no_show'     to 'no_asistio';
-- 'seguimiento' unchanged.

comment on column appointments.coach_note is
  'JUBILADA (#14): las notas de la videollamada viven ahora en session_reports (el parte 1:1). No usar — se mantiene por compatibilidad histórica.';
