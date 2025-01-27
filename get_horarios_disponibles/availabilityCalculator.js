function availabilityCalculator(inputData) {
  // Validar que inputData tenga las propiedades necesarias
  if (!inputData || !inputData.tratamientos || !inputData.prog_medicos || !inputData.prog_espacios || !inputData.citas_programadas) {
      throw new Error("El objeto de entrada no tiene las propiedades requeridas.");
  }

  let availableSlots = [];
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  // Recorrer cada tratamiento
  inputData.tratamientos.forEach(tratamiento => {
      if (!tratamiento.tratamiento || !tratamiento.tratamiento.id_tratamiento || !tratamiento.tratamiento.duracion_tratamiento) {
          console.log('tratamiento.tratamiento', tratamiento.tratamiento)
          console.log('tratamiento.tratamiento.id_tratamiento', tratamiento.tratamiento.id_tratamiento)
          console.log('tratamiento.tratamiento.duracion_tratamiento', tratamiento.tratamiento.duracion_tratamiento)

          console.warn(`El tratamiento con datos incompletos fue ignorado: ${JSON.stringify(tratamiento)}`);
          return;
      }

      tratamiento.medicos.forEach(medico => {
          if (!medico.id_medico || !medico.espacios) {
              console.warn(`El médico con datos incompletos fue ignorado: ${JSON.stringify(medico)}`);
              return;
          }

          medico.espacios.forEach(espacio => {
              if (!espacio.id_espacio || !espacio.nombre) {
                  console.warn(`El espacio con datos incompletos fue ignorado: ${JSON.stringify(espacio)}`);
                  return;
              }

              // Filtrar programaciones del médico y del espacio
              const programasMedicoEspacio = inputData.prog_medicos.filter(prog =>
                  prog.id_medico === medico.id_medico && prog.id_espacio === espacio.id_espacio
              );
              const programasEspacio = inputData.prog_espacios.filter(prog =>
                  prog.id_espacio === espacio.id_espacio
              );

              // Si no hay programas, no hay disponibilidad
              if (programasMedicoEspacio.length === 0 || programasEspacio.length === 0) {
                  return;
              }

              // Filtrar citas programadas para este médico, espacio y tratamiento
              const citasProgramadas = inputData.citas_programadas.filter(cita =>
                  cita.id_medico === medico.id_medico &&
                  cita.id_espacio === espacio.id_espacio &&
                  cita.id_tratamiento === tratamiento.tratamiento.id_tratamiento
              );

              // Generar horarios disponibles basados en las programaciones
              programasEspacio.forEach(programaEspacio => {
                  const fechaInicio = new Date(programaEspacio.fecha_inicio);
                  const fechaFin = new Date(programaEspacio.fecha_fin);

                  while (fechaInicio <= fechaFin) {
                      const fechaStr = fechaInicio.toISOString().split('T')[0];

                      // Calcular las horas disponibles dentro del rango
                      let horaInicio = new Date(fechaInicio);
                      horaInicio.setHours(
                          parseInt(programaEspacio.hora_inicio.slice(0, 2), 10),
                          parseInt(programaEspacio.hora_inicio.slice(3, 5), 10),
                          0, 0
                      );
                      const horaFin = new Date(fechaInicio);
                      horaFin.setHours(
                          parseInt(programaEspacio.hora_fin.slice(0, 2), 10),
                          parseInt(programaEspacio.hora_fin.slice(3, 5), 10),
                          0, 0
                      );

                      while (horaInicio < horaFin) {
                          const horaInicioStr = horaInicio.toTimeString().split(' ')[0];

                          // Calcular el horario de fin basado en la duración del tratamiento
                          const horaFinSlot = new Date(horaInicio);
                          horaFinSlot.setMinutes(horaInicio.getMinutes() + tratamiento.tratamiento.duracion_tratamiento);
                          const horaFinStr = horaFinSlot.toTimeString().split(' ')[0];

                          // Verificar si el horario está disponible
                          const solapamiento = citasProgramadas.some(cita => {
                              const citaFecha = new Date(cita.fecha_cita);
                              const citaHoraInicio = new Date(citaFecha);
                              const [citaHoras, citaMinutos] = cita.hora_inicio.split(':');
                              citaHoraInicio.setHours(citaHoras, citaMinutos, 0, 0);

                              const citaHoraFin = new Date(citaHoraInicio);
                              citaHoraFin.setMinutes(citaHoraInicio.getMinutes() + tratamiento.tratamiento.duracion_tratamiento);

                              // Verificar si las citas se solapan
                              return (
                                  citaFecha.toISOString().split('T')[0] === fechaStr &&
                                  (
                                      (horaInicio >= citaHoraInicio && horaInicio < citaHoraFin) ||
                                      (horaFinSlot > citaHoraInicio && horaFinSlot <= citaHoraFin)
                                  )
                              );
                          });

                          if (!solapamiento && horaInicio >= hoy) {
                              availableSlots.push({
                                  fecha_inicio: fechaStr,
                                  fecha_fin: fechaStr,
                                  hora_inicio: horaInicioStr,
                                  hora_fin: horaFinStr,
                                  id_medico: medico.id_medico,
                                  nombre_medico: medico.nombre_medico,
                                  id_espacio: espacio.id_espacio,
                                  nombre_espacio: espacio.nombre,
                                  id_tratamiento: tratamiento.tratamiento.id_tratamiento,
                                  nombre_tratamiento: tratamiento.tratamiento.nombre_tratamiento,
                                  duracion_tratamiento: tratamiento.tratamiento.duracion_tratamiento
                              });
                          }

                          // Avanzar al siguiente horario
                          horaInicio.setMinutes(horaInicio.getMinutes() + tratamiento.tratamiento.duracion_tratamiento);
                      }

                      // Avanzar al siguiente día
                      fechaInicio.setDate(fechaInicio.getDate() + 1);
                  }
              });
          });
      });
  });

  return availableSlots;
}

module.exports = availabilityCalculator;