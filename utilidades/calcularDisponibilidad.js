function calcularDisponibilidad(entrada) {
  const {
    tratamientos,
    citas_programadas,
    prog_medicos,
    prog_espacios
  } = entrada;

  const listaDisponibles = [];

  const convertirHoraAMinutos = (horaStr) => {
    const [horas, minutos] = horaStr.split(":").map(Number);
    return horas * 60 + minutos;
  };

  const convertirMinutosAHora = (minutosTotales) => {
    const horas = Math.floor(minutosTotales / 60);
    const minutos = minutosTotales % 60;
    return `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}:00`;
  };

  tratamientos.forEach(({ tratamiento, medicos }) => {
    medicos.forEach((medico) => {
      medico.espacios.forEach((espacio) => {
        const programacionEspacio = prog_espacios.filter(
          (p) => p.id_espacio === espacio.id_espacio
        );
        const programacionMedico = prog_medicos.filter(
          (p) => p.id_medico === medico.id_medico
        );

        programacionEspacio.forEach((progEsp) => {
          programacionMedico.forEach((progMed) => {
            if (
              progEsp.fecha_inicio.getTime() !== progMed.fecha_inicio.getTime() ||
              progEsp.fecha_fin.getTime() !== progMed.fecha_fin.getTime()
            ) {
              return;
            }

            const inicioEsp = convertirHoraAMinutos(progEsp.hora_inicio);
            const finEsp = convertirHoraAMinutos(progEsp.hora_fin);
            const inicioMed = convertirHoraAMinutos(progMed.hora_inicio);
            const finMed = convertirHoraAMinutos(progMed.hora_fin);

            const ventanaInicio = Math.max(inicioEsp, inicioMed);
            const ventanaFin = Math.min(finEsp, finMed);
            if (ventanaInicio >= ventanaFin) return;

            const citasBloqueantes = citas_programadas
              .filter((c) => c.fecha_cita.getTime() === progEsp.fecha_inicio.getTime())

              .filter((c) => c.id_espacio === espacio.id_espacio || c.id_medico === medico.id_medico)
              // solapadas con la ventana (ventanaInicio - ventanaFin)
              .filter((c) => {
                const cInicio = convertirHoraAMinutos(c.hora_inicio);
                const cFin = convertirHoraAMinutos(c.hora_fin);
                return !(cFin <= ventanaInicio || cInicio >= ventanaFin);
              })
              .map((c) => ({
                inicio: convertirHoraAMinutos(c.hora_inicio),
                fin: convertirHoraAMinutos(c.hora_fin),
              }))
              .sort((a, b) => a.inicio - b.inicio);

            let ultimoFin = ventanaInicio;
            const intervalosLibres = [];

            for (const cita of citasBloqueantes) {
              if (cita.inicio > ultimoFin) {
                intervalosLibres.push({ start: ultimoFin, end: cita.inicio });
              }
              ultimoFin = Math.max(ultimoFin, cita.fin);
            }
            if (ultimoFin < ventanaFin) {
              intervalosLibres.push({ start: ultimoFin, end: ventanaFin });
            }

            intervalosLibres.forEach(({ start, end }) => {
              const inicioPosibleMasTarde = end - tratamiento.duracion_tratamiento;
              if (inicioPosibleMasTarde >= start) {
                listaDisponibles.push({
                  fecha_inicio: progEsp.fecha_inicio.toISOString().slice(0, 10),
                  fecha_fin: progEsp.fecha_fin.toISOString().slice(0, 10),
                  hora_inicio_minima: convertirMinutosAHora(start),
                  hora_inicio_maxima: convertirMinutosAHora(inicioPosibleMasTarde),
                  id_medico: medico.id_medico,
                  nombre_medico: medico.nombre_medico,
                  id_espacio: espacio.id_espacio,
                  nombre_espacio: espacio.nombre_espacio,
                  id_tratamiento: tratamiento.id_tratamiento,
                  nombre_tratamiento: tratamiento.nombre_tratamiento,
                  duracion_tratamiento: tratamiento.duracion_tratamiento,
                });
              }
            });
          });
        });
      });
    });
  });

  return listaDisponibles;
}

module.exports = calcularDisponibilidad;
