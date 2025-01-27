function calculateAvailability(inputData) {
  const { 
      tratamientos, 
      prog_medicos, 
      prog_espacios, 
      citas_programadas, 
      medicos, 
      espacios, 
      medico_espacio, 
      espacio_tratamiento 
  } = inputData;

  // Construir estructuras para fácil acceso
  const medicosMap = Object.fromEntries(medicos.map(m => [m.id_medico, m.nombre_completo]));
  const espaciosMap = Object.fromEntries(espacios.map(e => [e.id_espacio, e.nombre_espacio]));

  // Relación médico-espacio
  const medicoEspacioMap = medico_espacio.reduce((map, rel) => {
      const { id_medico, id_espacio } = rel;
      if (!map[id_medico]) map[id_medico] = new Set();
      map[id_medico].add(id_espacio);
      return map;
  }, {});

  // Relación espacio-tratamiento
  const espacioTratamientoMap = espacio_tratamiento.reduce((map, rel) => {
      const { id_espacio, id_tratamiento } = rel;
      if (!map[id_espacio]) map[id_espacio] = new Set();
      map[id_espacio].add(id_tratamiento);
      return map;
  }, {});

  // Construir disponibilidad
  const disponibilidadMedicos = buildAvailability(prog_medicos, 'id_medico');
  const disponibilidadEspacios = buildAvailability(prog_espacios, 'id_espacio');

  // Bloquear horarios por citas programadas
  blockScheduledAppointments(disponibilidadMedicos, citas_programadas, 'id_medico');
  blockScheduledAppointments(disponibilidadEspacios, citas_programadas, 'id_espacio');

  // Generar la disponibilidad
  const disponibilidad = [];

  tratamientos.forEach(tratamiento => {
      const { id_tratamiento, nombre_tratamiento, duracion } = tratamiento;
      const duracionMs = duracion * 60 * 1000; // Convertir minutos a milisegundos

      for (const [id_medico, horariosMedico] of Object.entries(disponibilidadMedicos)) {
          const nombreMedico = medicosMap[id_medico];
          const espaciosAsignados = medicoEspacioMap[id_medico] || new Set();

          for (const id_espacio of espaciosAsignados) {
              if (!espacioTratamientoMap[id_espacio]?.has(id_tratamiento)) continue;

              const horariosEspacio = disponibilidadEspacios[id_espacio] || {};
              const nombreEspacio = espaciosMap[id_espacio];

              const horariosCombinados = combineSchedules(horariosMedico, horariosEspacio);

              Object.entries(horariosCombinados).forEach(([fecha, slots]) => {
                  slots.forEach(slot => {
                      const { inicio, fin } = slot;

                      const inicioDisponible = alignTime(inicio, true);
                      const finDisponibleMax = alignTime(fin - duracionMs, false);

                      if (inicioDisponible <= finDisponibleMax) {
                          disponibilidad.push({
                              fecha,
                              hora_inicio_minima: new Date(inicioDisponible).toISOString(),
                              hora_inicio_maxima: new Date(finDisponibleMax).toISOString(),
                              id_medico: parseInt(id_medico, 10),
                              nombre_medico: nombreMedico,
                              id_espacio: parseInt(id_espacio, 10),
                              nombre_espacio: nombreEspacio,
                              id_tratamiento,
                              nombre_tratamiento,
                              duracion_tratamiento: duracion
                          });
                      }
                  });
              });
          }
      }
  });

  return disponibilidad;
}

function buildAvailability(progList, idKey) {
  const availability = {};
  progList.forEach(prog => {
      const id = prog[idKey];
      const fechaInicio = new Date(prog.fecha_inicio);
      const fechaFin = new Date(prog.fecha_fin);
      const horaInicio = parseTime(prog.hora_inicio);
      const horaFin = parseTime(prog.hora_fin);

      let currentDate = new Date(fechaInicio);
      while (currentDate <= fechaFin) {
          const fechaStr = currentDate.toISOString().split('T')[0];
          if (!availability[id]) availability[id] = {};
          if (!availability[id][fechaStr]) availability[id][fechaStr] = [];

          availability[id][fechaStr].push({
              inicio: new Date(currentDate.getTime() + horaInicio),
              fin: new Date(currentDate.getTime() + horaFin)
          });

          currentDate.setDate(currentDate.getDate() + 1);
      }
  });
  return availability;
}

function blockScheduledAppointments(availability, appointments, idKey) {
  appointments.forEach(cita => {
      const id = cita[idKey];
      const fecha = new Date(cita.fecha_cita).toISOString().split('T')[0];
      const inicio = parseTime(cita.hora_inicio);
      const fin = parseTime(cita.hora_fin);

      if (availability[id]?.[fecha]) {
          availability[id][fecha] = updateAvailability(
              availability[id][fecha],
              new Date(inicio),
              new Date(fin)
          );
      }
  });
}

function updateAvailability(slots, start, end) {
  const updatedSlots = [];
  slots.forEach(slot => {
      if (slot.fin <= start || slot.inicio >= end) {
          updatedSlots.push(slot);
      } else {
          if (slot.inicio < start) updatedSlots.push({ inicio: slot.inicio, fin: start });
          if (slot.fin > end) updatedSlots.push({ inicio: end, fin: slot.fin });
      }
  });
  return updatedSlots;
}

function combineSchedules(schedule1, schedule2) {
  const combined = {};
  for (const fecha in schedule1) {
      if (schedule2[fecha]) {
          const slots1 = schedule1[fecha];
          const slots2 = schedule2[fecha];
          const merged = [];

          slots1.forEach(slot1 => {
              slots2.forEach(slot2 => {
                  const inicio = Math.max(slot1.inicio, slot2.inicio);
                  const fin = Math.min(slot1.fin, slot2.fin);
                  if (inicio < fin) merged.push({ inicio, fin });
              });
          });

          combined[fecha] = mergeOverlappingSlots(merged);
      }
  }
  return combined;
}

function mergeOverlappingSlots(slots) {
  if (!slots.length) return [];
  slots.sort((a, b) => a.inicio - b.inicio);
  const merged = [slots[0]];

  for (let i = 1; i < slots.length; i++) {
      const last = merged[merged.length - 1];
      if (slots[i].inicio <= last.fin) {
          last.fin = Math.max(last.fin, slots[i].fin);
      } else {
          merged.push(slots[i]);
      }
  }

  return merged;
}

function alignTime(time, roundUp) {
  const date = new Date(time);
  const minutes = date.getUTCMinutes();
  const alignedMinutes = roundUp
      ? Math.ceil(minutes / 15) * 15
      : Math.floor(minutes / 15) * 15;
  date.setUTCMinutes(alignedMinutes, 0, 0);
  return date.getTime();
}

function parseTime(timeStr) {
  const [hours, minutes, seconds] = timeStr.split(':').map(Number);
  return (hours * 60 * 60 + minutes * 60 + (seconds || 0)) * 1000;
}
