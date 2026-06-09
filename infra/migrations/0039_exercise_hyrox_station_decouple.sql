-- Un ejercicio cardio (SkiErg, Rowing) PUEDE ser estación HYROX. Desacopla la
-- posición de estación de la categoría: position válida 1-8 o null, sin exigir
-- category='hyrox_station'. Permite fusionar los duplicados base+estación.
alter table exercises drop constraint if exists exercises_hyrox_station_chk;
alter table exercises add constraint exercises_hyrox_station_chk
  check (hyrox_station_position is null or (hyrox_station_position >= 1 and hyrox_station_position <= 8));
