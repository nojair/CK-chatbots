function ajustarDisponibilidad(disponibilidades, tiempoActual) {
  const fechaHoraActual = new Date(tiempoActual);
  const minutosActuales =
    fechaHoraActual.getHours() * 60 + fechaHoraActual.getMinutes();

  const nuevasDisponibilidades = disponibilidades.filter((item) => {
    const fechaItem = new Date(item.fecha_inicio);

    const fechaItemStr = fechaItem.toISOString().slice(0, 10);
    const fechaActualStr = fechaHoraActual.toISOString().slice(0, 10);

    if (fechaItemStr < fechaActualStr) {
      return false;
    }

    if (fechaItemStr === fechaActualStr) {
      const horaMinima = convertirHoraAMinutos(item.hora_inicio_minima);
      const horaMaxima = convertirHoraAMinutos(item.hora_inicio_maxima);

      if (horaMaxima < minutosActuales) {
        return false;
      }

      if (horaMinima < minutosActuales) {
        item.hora_inicio_minima = convertirMinutosAHora(minutosActuales);
      }
    }

    return true;
  });

  return nuevasDisponibilidades;
}

function convertirHoraAMinutos(hora) {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

function convertirMinutosAHora(totalMinutos) {
  const horas = Math.floor(totalMinutos / 60);
  const minutos = totalMinutos % 60;
  return `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}:00`;
}

module.exports = ajustarDisponibilidad;
