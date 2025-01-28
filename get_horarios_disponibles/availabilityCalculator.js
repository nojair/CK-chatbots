function availabilityCalculator(inputData) {
  const { tratamientos, citas_programadas, prog_medicos, prog_espacios } = inputData;
  const availableSlots = [];

  // Helper to convert time string to minutes since midnight
  const timeToMinutes = (timeStr) => {
    const [hours, minutes, seconds] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
  };

  // Helper to convert minutes back to time string
  const minutesToTime = (totalMinutes) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
  };

  tratamientos.forEach(({ tratamiento: t, medicos }) => {
    medicos.forEach(medico => {
      const citasDelMedico = citas_programadas.filter(
        c => c.id_medico === medico.id_medico && c.id_tratamiento === t.id_tratamiento
      );

      medico.espacios.forEach(espacio => {
        const progEspacio = prog_espacios.filter(p => p.id_espacio === espacio.id_espacio);
        const progMedico = prog_medicos.filter(p => p.id_medico === medico.id_medico);

        progEspacio.forEach(espacioProg => {
          progMedico.forEach(medicoProg => {
            // Ensure doctor and space schedules overlap and match dates
            if (
              espacioProg.fecha_inicio.getTime() === medicoProg.fecha_inicio.getTime() &&
              espacioProg.fecha_fin.getTime() === medicoProg.fecha_fin.getTime()
            ) {
              const espacioStart = timeToMinutes(espacioProg.hora_inicio);
              const espacioEnd = timeToMinutes(espacioProg.hora_fin);
              const medicoStart = timeToMinutes(medicoProg.hora_inicio);
              const medicoEnd = timeToMinutes(medicoProg.hora_fin);

              // Determine the actual available window (intersection of doctor/space schedules)
              const windowStart = Math.max(espacioStart, medicoStart);
              const windowEnd = Math.min(espacioEnd, medicoEnd);

              if (windowStart >= windowEnd) return; // No overlap

              // Get appointments in this space and doctor
              const citas = citasDelMedico
                .filter(c => c.id_espacio === espacio.id_espacio)
                .map(c => ({
                  start: timeToMinutes(c.hora_inicio),
                  end: timeToMinutes(c.hora_fin),
                }))
                .sort((a, b) => a.start - b.start); // Sort by start time

              // Calculate available intervals
              let lastEnd = windowStart;
              const intervals = [];
              for (const cita of citas) {
                if (cita.start > lastEnd) {
                  intervals.push({ start: lastEnd, end: cita.start });
                }
                lastEnd = Math.max(lastEnd, cita.end);
              }
              if (lastEnd < windowEnd) {
                intervals.push({ start: lastEnd, end: windowEnd });
              }

              // Generate slots for each interval
              intervals.forEach(({ start, end }) => {
                const latestStart = end - t.duracion_tratamiento;
                if (latestStart >= start) {
                  availableSlots.push({
                    fecha_inicio: espacioProg.fecha_inicio.toISOString().slice(0,10),
                    fecha_fin: espacioProg.fecha_fin.toISOString().slice(0,10),
                    hora_inicio_minima: minutesToTime(start),
                    hora_inicio_maxima: minutesToTime(latestStart),
                    id_medico: medico.id_medico,
                    nombre_medico: medico.nombre_medico,
                    id_espacio: espacio.id_espacio,
                    nombre_espacio: espacio.nombre_espacio,
                    id_tratamiento: t.id_tratamiento,
                    nombre_tratamiento: t.nombre_tratamiento,
                    duracion_tratamiento: t.duracion_tratamiento,
                  });
                }
              });
            }
          });
        });
      });
    });
  });

  return availableSlots;
}

module.exports = availabilityCalculator;