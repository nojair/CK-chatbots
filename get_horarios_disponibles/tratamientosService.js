// Servicio para procesar los tratamientos, médicos y espacios
async function getTratamientosData(connection, {
  id_clinica,
  tratamientosConsultados
}) {
  console.log("Iniciando la consulta de tratamientos...");
  
  const [foundTratamientos] = await connection.execute(
    `
    SELECT DISTINCT 
        id_tratamiento,
        nombre_tratamiento,
        duracion,
        MATCH(nombre_tratamiento, descripcion) AGAINST(?) AS relevancia,
        (CASE 
            WHEN nombre_tratamiento IN (${tratamientosConsultados.map(() => '?').join(', ')}) THEN 1 
            ELSE 0 
         END) AS es_exacto
    FROM tratamientos
    WHERE MATCH(nombre_tratamiento, descripcion) AGAINST(?)
      AND id_clinica = ?
    ORDER BY es_exacto DESC, relevancia DESC, nombre_tratamiento ASC
    `,
    [
      tratamientosConsultados.join(" "), 
      ...tratamientosConsultados, 
      tratamientosConsultados.join(" "), 
      id_clinica
    ]
  );  

  if (foundTratamientos.length === 0) {
    console.warn("No se encontraron tratamientos para la clínica:", id_clinica);
  }

  const tratamientos = foundTratamientos.filter(ft => ft.es_exacto == 1);
  if (tratamientos.length === 0) {
    console.warn("No se encontraron tratamientos exactos entre los seleccionados:", tratamientosConsultados);
  }

  const result = [];
  for (const tratamiento of tratamientos) {
    console.log("Procesando tratamiento:", tratamiento.nombre_tratamiento);

    const [medicos] = await connection.execute(
      `SELECT m.id_medico, m.nombre_medico, m.apellido_medico 
       FROM medicos m
       INNER JOIN medico_tratamiento mt ON mt.id_medico = m.id_medico
       WHERE mt.id_tratamiento = ?
       AND m.id_clinica = ?`,
      [tratamiento.id_tratamiento, id_clinica]
    );

    if (medicos.length === 0) {
      console.warn(`No se encontraron médicos para el tratamiento: ${tratamiento.nombre_tratamiento}`);
    }

    const medicosConEspacios = [];
    for (const medico of medicos) {
      console.log(`Procesando médico: ${medico.nombre_medico} ${medico.apellido_medico}`);

      const [espacios] = await connection.execute(
        `
        SELECT e.id_espacio, e.nombre AS nombre_espacio
        FROM espacios e
        INNER JOIN medico_espacio me ON me.id_espacio = e.id_espacio
        INNER JOIN espacios_tratamientos et ON et.id_espacio = e.id_espacio
        WHERE me.id_medico = ? 
          AND et.id_tratamiento = ?
          AND e.id_clinica = ?
        `,
        [medico.id_medico, tratamiento.id_tratamiento, id_clinica]
      );      

      if (espacios.length === 0) {
        console.warn(`No se encontraron espacios para el médico: ${medico.nombre_medico} ${medico.apellido_medico}`);
      }

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
        duracion_tratamiento: tratamiento.duracion,
      },
      medicos: medicosConEspacios,
    });
  }

  if (result.length === 0) {
    console.warn("No se encontraron resultados para ningún tratamiento, médico o espacio.");
  }

  return result;
}

module.exports = { getTratamientosData };
