function generarConsultaSQL({
  nombreTabla,
  listaFechas,
  listaIdMedicos = [],
  listaIdEspacios = [],
  idClinica,
}) {
  const condicionesTiempo = listaFechas.map((fechaObj) =>
    nombreTabla === "citas"
      ? `(fecha_cita = '${fechaObj.fecha}')`
      : `('${fechaObj.fecha}' BETWEEN fecha_inicio AND fecha_fin)`
  );

  const condicionesIds = [];
  if (listaIdMedicos.length > 0 && ["citas", "prog_medicos"].includes(nombreTabla)) {
    condicionesIds.push(`id_medico IN (${listaIdMedicos.join(", ")})`);
  }
  if (listaIdEspacios.length > 0 && ["citas", "prog_espacios"].includes(nombreTabla)) {
    condicionesIds.push(`id_espacio IN (${listaIdEspacios.join(", ")})`);
  }

  const condicionesClinica = [`id_clinica = ${idClinica}`];
  const condicionesEstado = nombreTabla === "citas" ? ["id_estado_cita IN (1, 4, 7)"] : [];

  // Combinar todas las condiciones
  const whereConditions = [
    `(\n  ${condicionesTiempo.join(" OR\n  ")}\n)`,
    ...(condicionesIds.length > 0
      ? [`(\n  ${condicionesIds.join(" OR ")}\n)`]
      : []),
    `(\n  ${condicionesClinica.join(" AND ")}\n)`,
    ...(condicionesEstado.length > 0
      ? [`(\n  ${condicionesEstado.join(" AND ")}\n)`]
      : []),
  ];

  return `
SELECT *
FROM ${nombreTabla}
WHERE
  ${whereConditions.join(" AND\n  ")}
`.trim();
}

function generarConsultasSQL({ fechas, id_medicos, id_espacios, id_clinica }) {
  if (!fechas || !id_clinica) {
    throw new Error("Los campos 'fechas' e 'id_clinica' son obligatorios.");
  }

  return {
    sql_citas: generarConsultaSQL({
      nombreTabla: "citas",
      listaFechas: fechas,
      listaIdMedicos: id_medicos || [],
      listaIdEspacios: id_espacios || [],
      idClinica: id_clinica,
    }),
    sql_prog_medicos: generarConsultaSQL({
      nombreTabla: "prog_medicos",
      listaFechas: fechas,
      listaIdMedicos: id_medicos || [],
      listaIdEspacios: [],
      idClinica: id_clinica,
    }),
    sql_prog_espacios: generarConsultaSQL({
      nombreTabla: "prog_espacios",
      listaFechas: fechas,
      listaIdMedicos: [],
      listaIdEspacios: id_espacios || [],
      idClinica: id_clinica,
    }),
  };
}

module.exports = {
  generarConsultasSQL,
};
