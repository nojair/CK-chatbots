// treatmentsService.js
const executeWithRetry = async (connection, query, params = [], retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await connection.execute(query, params);
    } catch (error) {
      if (error.code === 'ER_CLIENT_INTERACTION_TIMEOUT' && attempt < retries) {
        console.warn(`Timeout en intento ${attempt}, reintentando...`);
        await new Promise(res => setTimeout(res, 1000)); // Espera 1 segundo antes de reintentar
      } else {
        throw error;
      }
    }
  }
};

async function getTratamientosData(connection, { id_clinica, tratamientosConsultados }) {
  let errorMessaeges = [];
  console.log("Iniciando la consulta de tratamientos...");

  // Validar conexión
  try {
    await connection.ping();
  } catch (err) {
    console.error("Conexión cerrada, reintentando...");
    throw new Error("Conexión a la base de datos perdida.");
  }

  // Consulta principal con retries
  let foundTratamientos;
  try {
    const matchAgainst = tratamientosConsultados.join(" ");
    const exactMatchPlaceholders = tratamientosConsultados.map(() => 'LOWER(TRIM(?))').join(', ');

    const query = `
      SELECT DISTINCT 
          id_tratamiento,
          nombre_tratamiento,
          duracion AS duracion_tratamiento,
          MATCH(nombre_tratamiento, descripcion) AGAINST(?) AS relevancia,
          (CASE 
              WHEN LOWER(TRIM(nombre_tratamiento)) IN (${exactMatchPlaceholders}) THEN 1 
              ELSE 0 
           END) AS es_exacto
      FROM tratamientos
      WHERE MATCH(nombre_tratamiento, descripcion) AGAINST(?)
        AND id_clinica = ?
      ORDER BY es_exacto DESC, relevancia DESC, nombre_tratamiento ASC
    `;

    const params = [
      matchAgainst,
      ...tratamientosConsultados.map(tc => tc.toLowerCase().trim()),
      matchAgainst,
      id_clinica
    ];

    const [results] = await executeWithRetry(connection, query, params);
    foundTratamientos = results;
  } catch (error) {
    console.error("Error al ejecutar la consulta de tratamientos:", error);
    throw error;
  }

  if (foundTratamientos.length === 0) {
    const error = "[ERR001] No se encontraron tratamientos para la clínica: " + id_clinica;
    console.warn(error);
    errorMessaeges.push(error);
  }

  console.warn("foundTratamientos", foundTratamientos);

  const tratamientos = foundTratamientos.filter(ft => ft.es_exacto == 1);
  if (tratamientos.length === 0) {
    const error = "[ERR002] No se encontraron tratamientos exactos entre los seleccionados: " + tratamientosConsultados.join(', ');
    console.warn(error);
    errorMessaeges.push(error);
  }

  // Utilizar Promise.all para procesar tratamientos en paralelo
  const tratamientosPromises = tratamientos.map(async (tratamiento) => {
    console.log("Procesando tratamiento:", tratamiento.nombre_tratamiento);

    // Obtener médicos asociados al tratamiento
    let medicos;
    try {
      const [medicosResult] = await executeWithRetry(connection, `
        SELECT m.id_medico, m.nombre_medico, m.apellido_medico 
        FROM medicos m
        INNER JOIN medico_tratamiento mt ON mt.id_medico = m.id_medico
        WHERE mt.id_tratamiento = ?
          AND m.id_clinica = ?
      `, [tratamiento.id_tratamiento, id_clinica]);
      medicos = medicosResult;
    } catch (error) {
      console.error(`Error al obtener médicos para el tratamiento ${tratamiento.nombre_tratamiento}:`, error);
      throw error;
    }

    if (medicos.length === 0) {
      const error = `[ERR003] No se encontraron médicos para el tratamiento: ${tratamiento.nombre_tratamiento}`;
      console.warn(error);
      errorMessaeges.push(error);
    }

    // Utilizar Promise.all para obtener espacios para cada médico en paralelo
    const medicosConEspaciosPromises = medicos.map(async (medico) => {
      console.log(`Procesando médico: ${medico.nombre_medico} ${medico.apellido_medico}`);

      let espacios;
      try {
        const [espaciosResult] = await executeWithRetry(connection, `
          SELECT e.id_espacio, e.nombre AS nombre_espacio
          FROM espacios e
          INNER JOIN medico_espacio me ON me.id_espacio = e.id_espacio
          INNER JOIN espacios_tratamientos et ON et.id_espacio = e.id_espacio
          WHERE me.id_medico = ? 
            AND et.id_tratamiento = ?
            AND e.id_clinica = ?
        `, [medico.id_medico, tratamiento.id_tratamiento, id_clinica]);
        espacios = espaciosResult;
      } catch (error) {
        console.error(`Error al obtener espacios para el médico ${medico.nombre_medico}:`, error);
        throw error;
      }

      if (espacios.length === 0) {
        const error = `[ERR004] No se encontraron espacios para el médico: ${medico.nombre_medico} ${medico.apellido_medico}`;
        console.warn(error);
        errorMessaeges.push(error);
      }

      return {
        id_medico: medico.id_medico,
        nombre_medico: `${medico.nombre_medico} ${medico.apellido_medico}`,
        espacios: espacios,
      };
    });

    const medicosConEspacios = await Promise.all(medicosConEspaciosPromises);

    return {
      tratamiento: {
        id_tratamiento: tratamiento.id_tratamiento,
        nombre_tratamiento: tratamiento.nombre_tratamiento,
        duracion_tratamiento: tratamiento.duracion_tratamiento,
      },
      medicos: medicosConEspacios,
    };
  });

  let result;
  try {
    result = await Promise.all(tratamientosPromises);
  } catch (error) {
    console.error("Error al procesar tratamientos en paralelo:", error);
    throw error;
  }

  if (result.length === 0) {
    const error = "[ERR005] No se encontraron resultados para ningún tratamiento, médico o espacio.";
    console.warn(error);
    errorMessaeges.push(error);
  }

  return {
    result,
    errorMessaeges
  };
}

module.exports = { getTratamientosData };
