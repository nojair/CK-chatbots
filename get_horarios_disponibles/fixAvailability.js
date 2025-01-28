function fixAvailability(disponibilidades, tiempoActual) {
  const tiempoActualDate = new Date(tiempoActual); // Convertir a objeto Date
  const tiempoActualMinutes = tiempoActualDate.getHours() * 60 + tiempoActualDate.getMinutes(); // Minutos desde medianoche

  const nuevasDisponibilidades = disponibilidades.filter(disponibilidad => {
    const fechaInicio = new Date(disponibilidad.fecha_inicio);

    // Si la fecha de inicio es anterior a la fecha actual, descartar
    if (fechaInicio.toISOString().slice(0, 10) < tiempoActualDate.toISOString().slice(0, 10)) {
      return false;
    }

    // Si la fecha de inicio es igual a la fecha actual, ajustar las horas
    if (fechaInicio.toISOString().slice(0, 10) === tiempoActualDate.toISOString().slice(0, 10)) {
      const horaInicioMinima = fromHourToMinutes(disponibilidad.hora_inicio_minima);
      const horaInicioMaxima = fromHourToMinutes(disponibilidad.hora_inicio_maxima);

      // Si la hora de inicio máxima es anterior al tiempo actual, descartar
      if (horaInicioMaxima < tiempoActualMinutes) {
        return false;
      }

      // Ajustar la hora de inicio mínima si es anterior al tiempo actual
      if (horaInicioMinima < tiempoActualMinutes) {
        disponibilidad.hora_inicio_minima = fromMinutesToHour(tiempoActualMinutes);
      }
    }

    return true;
  });

  return nuevasDisponibilidades;
}

// Helper para convertir "HH:MM:SS" a minutos desde medianoche
function fromHourToMinutes(hora) {
  const [hours, minutes] = hora.split(":").map(Number);
  return hours * 60 + minutes;
}

// Helper para convertir minutos desde medianoche a "HH:MM:SS"
function fromMinutesToHour(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}

module.exports = fixAvailability;
