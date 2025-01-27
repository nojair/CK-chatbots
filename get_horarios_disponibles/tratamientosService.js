// Servicio para procesar los tratamientos, médicos y espacios
async function getTratamientosData(connection, {
  id_clinica,
  tratamientosSeleccionados
}) {
  const [foundTratamientos] = await connection.execute(
    `
    SELECT DISTINCT 
        id_tratamiento, 
        nombre_tratamiento,
        MATCH(nombre_tratamiento, descripcion) AGAINST(?) AS relevancia,
        (CASE 
            WHEN nombre_tratamiento IN (${tratamientosSeleccionados.map(() => '?').join(', ')}) THEN 1 
            ELSE 0 
         END) AS es_exacto
    FROM tratamientos
    WHERE MATCH(nombre_tratamiento, descripcion) AGAINST(?)
      AND id_clinica = ?
    ORDER BY es_exacto DESC, relevancia DESC, nombre_tratamiento ASC
    `,
    [
      tratamientosSeleccionados.join(" "), // Parámetro para la búsqueda MATCH
      ...tratamientosSeleccionados, // Parámetros para la verificación exacta
      tratamientosSeleccionados.join(" "), // Reutilizamos el texto para el segundo MATCH
      id_clinica, // ID de la clínica
    ]
  );

  const tratamientos = foundTratamientos.filter(ft => ft.es_exacto == 1);

  const result = [];
  for (const tratamiento of tratamientos) {
    const [medicos] = await connection.execute(
      `SELECT m.id_medico, m.nombre_medico, m.apellido_medico 
       FROM medicos m
       INNER JOIN medico_tratamiento mt ON mt.id_medico = m.id_medico
       WHERE mt.id_tratamiento = ?
       AND m.id_clinica = ?`,
      [tratamiento.id_tratamiento, id_clinica]
    );

    const medicosConEspacios = [];
    for (const medico of medicos) {
      const [espacios] = await connection.execute(
        `
        SELECT e.id_espacio, e.nombre 
        FROM espacios e
        INNER JOIN medico_espacio me ON me.id_espacio = e.id_espacio
        INNER JOIN espacios_tratamientos et ON et.id_espacio = e.id_espacio
        WHERE me.id_medico = ? 
          AND et.id_tratamiento = ?
          AND e.id_clinica = ?
        `,
        [medico.id_medico, tratamiento.id_tratamiento, id_clinica]
      );      

      medicosConEspacios.push({
        id_medico: medico.id_medico,
        nombre_medico: `${medico.nombre_medico} ${medico.apellido_medico}`,
        espacios: espacios,
      });
    }

    result.push({
      tratamiento: {
        id_tratamiento: tratamiento.id_tratamiento,
        nombre_tratamiento: tratamiento.nombre_tratamiento,
      },
      medicos: medicosConEspacios,
    });
  }

  return result;
}

module.exports = { getTratamientosData };
