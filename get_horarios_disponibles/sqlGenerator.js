const sqlGenerator = {
  /**
   * Genera todas las consultas SQL necesarias.
   * @param {Object} input - Datos de entrada.
   * @param {Array} input.fechas - Lista de fechas en formato [{ fecha: 'YYYY-MM-DD' }, ...].
   * @param {Array} [input.id_medicos] - Lista opcional de IDs de médicos.
   * @param {Array} [input.id_espacios] - Lista opcional de IDs de espacios.
   * @param {number} input.id_clinica - ID de la clínica.
   * @returns {Object} Consultas SQL generadas.
   */
  generarConsultasSQL: (input) => {
    if (!input.fechas || !input.id_clinica) {
      throw new Error("Los campos 'fechas' e 'id_clinica' son obligatorios.");
    }

    return {
      sql_citas: generarConsultaSQL({
        nombre_tabla: "citas",
        fechas: input.fechas,
        id_medicos: input.id_medicos,
        id_espacios: input.id_espacios,
        id_clinica: input.id_clinica,
      }),
      sql_prog_medicos: generarConsultaSQL({
        nombre_tabla: "prog_medicos",
        fechas: input.fechas,
        id_medicos: input.id_medicos,
        id_clinica: input.id_clinica,
      }),
      sql_prog_espacios: generarConsultaSQL({
        nombre_tabla: "prog_espacios",
        fechas: input.fechas,
        id_espacios: input.id_espacios,
        id_clinica: input.id_clinica,
      }),
    };
  },
};

/**
 * Genera una consulta SQL personalizada.
 * @param {Object} params - Parámetros necesarios.
 * @param {string} params.nombre_tabla - Nombre de la tabla.
 * @param {Array} params.fechas - Lista de fechas en formato [{ fecha: 'YYYY-MM-DD' }, ...].
 * @param {Array} [params.id_medicos] - Lista opcional de IDs de médicos.
 * @param {Array} [params.id_espacios] - Lista opcional de IDs de espacios.
 * @param {number} params.id_clinica - ID de la clínica.
 * @returns {string} Consulta SQL generada.
 */
function generarConsultaSQL({
  nombre_tabla,
  fechas,
  id_medicos = null,
  id_espacios = null,
  id_clinica,
}) {
  const condiciones_tiempo = fechas.map(
    (fechaObj) =>
      nombre_tabla === "citas"
        ? `(fecha_cita = '${fechaObj.fecha}')`
        : `('${fechaObj.fecha}' BETWEEN fecha_inicio AND fecha_fin)`
  );

  const condiciones_ids = [];
  if (id_medicos && ["citas", "prog_medicos"].includes(nombre_tabla)) {
    const ids_medicos_str = id_medicos.join(", ");
    condiciones_ids.push(`id_medico IN (${ids_medicos_str})`);
  }

  if (id_espacios && ["citas", "prog_espacios"].includes(nombre_tabla)) {
    const ids_espacios_str = id_espacios.join(", ");
    condiciones_ids.push(`id_espacio IN (${ids_espacios_str})`);
  }

  const condiciones_clinica = [`id_clinica = ${id_clinica}`];

  const condiciones_estado =
    nombre_tabla === "citas" ? ["id_estado_cita IN (1, 4)"] : [];

  const where_conditions = [
    `(\n  ${condiciones_tiempo.join(" OR\n  ")}\n)`,
    ...(condiciones_ids.length > 0
      ? [`(\n  ${condiciones_ids.join(" OR ")}\n)`]
      : []),
    `(\n  ${condiciones_clinica.join(" AND ")}\n)`,
    ...(condiciones_estado.length > 0
      ? [`(\n  ${condiciones_estado.join(" AND ")}\n)`]
      : []),
  ];

  return `
SELECT *
FROM ${nombre_tabla}
WHERE
  ${where_conditions.join(" AND\n  ")}
`.trim();
}

module.exports = sqlGenerator;
