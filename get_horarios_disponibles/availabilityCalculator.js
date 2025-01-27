function calculateAvailability(inputData) {
  const { 
      tratamientos, 
      prog_medicos, 
      prog_espacios, 
      citas_programadas 
  } = inputData;

  // Construir estructuras para fácil acceso
  const medicosMap = Object.fromEntries(inputData.tratamientos.flatMap(t => t.medicos.map(m => [m.id_medico, m.nombre_medico])));
  const espaciosMap = inputData.tratamientos.flatMap(t => t.medicos.flatMap(m => m.espacios.map(e => [e.id_espacio, e.nombre])));

  // Relación médico-espacio
  const medicoEspacioMap = inputData.tratamientos.reduce((map, tratamiento) => {
    tratamiento.medicos.forEach(medico => {
      const { id_medico, espacios } = medico;
      if (!map[id_medico]) map[id_medico] = new Set();
      espacios.forEach(espacio => map[id_medico].add(espacio.id_espacio));
    });
    return map;
  }, {});

  // Relación espacio-tratamiento
  const espacioTratamientoMap = inputData.tratamientos.reduce((map, tratamiento) => {
    const { id_tratamiento, medicos } = tratamiento;
    medicos.forEach(medico => {
      medico.espacios.forEach(espacio => {
        if (!map[espacio.id_espacio]) map[espacio.id_espacio] = new Set();
        map[espacio.id_espacio].add(id_tratamiento);
      });
    });
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
    const { id_tratamiento, nombre_tratamiento, medicos } = tratamiento;
    const duracionMs = tratamiento.duracion * 60 * 1000; // Convertir minutos a milisegundos

    medicos.forEach(medico => {
      const { id_medico, nombre_medico, espacios } = medico;
      const espaciosAsignados = medicoEspacioMap[id_medico] || new Set();

      espacios.forEach(espacio => {
        if (!espacioTratamientoMap[espacio.id_espacio]?.has(id_tratamiento)) return;

        const horariosMedico = disponibilidadMedicos[id_medico] || {};
        const horariosEspacio = disponibilidadEspacios[espacio.id_espacio] || {};
        const nombreEspacio = espacio.nombre;

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
                nombre_medico,
                id_espacio: parseInt(espacio.id_espacio, 10),
                nombre_espacio,
                id_tratamiento,
                nombre_tratamiento,
                duracion_tratamiento: tratamiento.duracion
              });
            }
          });
        });
      });
    });
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

      let currentTime = new Date(currentDate);
      currentTime.setHours(horaInicio.getHours(), horaInicio.getMinutes(), 0, 0);

      while (currentTime < horaFin) {
        availability[id][fechaStr].push({ inicio: currentTime.getTime(), fin: currentTime.getTime() + 30 * 60 * 1000 }); // slots de 30 minutos
        currentTime.setMinutes(currentTime.getMinutes() + 30); // avanzar al siguiente slot de 30 minutos
      }
      currentDate.setDate(currentDate.getDate() + 1); // pasar al siguiente día
    }
  });

  return availability;
}

function blockScheduledAppointments(disponibilidad, citas, idKey) {
  citas.forEach(cita => {
    const id = cita[idKey];
    const fecha = new Date(cita.fecha_cita).toISOString().split('T')[0];
    const horaInicio = parseTime(cita.hora_inicio);
    const horaFin = parseTime(cita.hora_fin);

    if (disponibilidad[id] && disponibilidad[id][fecha]) {
      disponibilidad[id][fecha] = disponibilidad[id][fecha].filter(slot => {
        return slot.inicio < horaInicio.getTime() || slot.fin > horaFin.getTime();
      });
    }
  });
}

function combineSchedules(horariosMedico, horariosEspacio) {
  const horariosCombinados = {};
  Object.keys(horariosMedico).forEach(fecha => {
    if (!horariosCombinados[fecha]) horariosCombinados[fecha] = [];
    horariosMedico[fecha].forEach(slot => {
      horariosEspacio[fecha]?.forEach(espacioSlot => {
        horariosCombinados[fecha].push({
          inicio: Math.max(slot.inicio, espacioSlot.inicio),
          fin: Math.min(slot.fin, espacioSlot.fin)
        });
      });
    });
  });
  return horariosCombinados;
}

function parseTime(timeString) {
  const [hours, minutes] = timeString.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function alignTime(time, isStart) {
  const date = new Date(time);
  if (isStart) {
    date.setMilliseconds(0);
    date.setSeconds(0);
  } else {
    date.setMilliseconds(0);
    date.setSeconds(59);
  }
  return date.getTime();
}
