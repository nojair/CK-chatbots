const ERRORS = require("./errors");

const executeWithRetry = async (connection, query, params = [], retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await connection.execute(query, params);
    } catch (error) {
      if (error.code === "ER_CLIENT_INTERACTION_TIMEOUT" && attempt < retries) {
        console.warn(`Timeout en intento ${attempt}, reintentando...`);
        await new Promise((res) => setTimeout(res, 1000));
      } else {
        throw ERRORS.QUERY_ERROR(error);
      }
    }
  }
};

async function getTratamientosData(connection, { id_clinica, tratamientosConsultados }) {
  console.log("Iniciando la consulta de tratamientos...");

  try {
    await connection.ping();
  } catch (err) {
    console.error("Conexión cerrada, reintentando...");
    throw ERRORS.DATABASE_CONNECTION;
  }

  let foundTratamientos;
  try {
    const matchAgainst = tratamientosConsultados.join(" ");
    const exactMatchPlaceholders = tratamientosConsultados.map(() => "LOWER(TRIM(?))").join(", ");

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
      ...tratamientosConsultados.map((tc) => tc.toLowerCase().trim()),
      matchAgainst,
      id_clinica,
    ];

    const [results] = await executeWithRetry(connection, query, params);
    foundTratamientos = results;
  } catch (error) {
    console.error("Error al ejecutar la consulta de tratamientos:", error);
    throw ERRORS.QUERY_ERROR(error);
  }

  if (foundTratamientos.length === 0) {
    console.warn(ERRORS.NO_TREATMENTS_FOUND.message);
    throw ERRORS.NO_TREATMENTS_FOUND;
  }

  console.warn("foundTratamientos", foundTratamientos);

  const tratamientos = foundTratamientos.filter((ft) => ft.es_exacto == 1);
  if (tratamientos.length === 0) {
    console.warn(ERRORS.NO_EXACT_TREATMENTS(tratamientosConsultados).message);
    throw ERRORS.NO_EXACT_TREATMENTS(tratamientosConsultados);
  }

  const tratamientosPromises = tratamientos.map(async (tratamiento) => {
    console.log("Procesando tratamiento:", tratamiento.nombre_tratamiento);

    let medicos;
    try {
      const [medicosResult] = await executeWithRetry(
        connection,
        `
        SELECT m.id_medico, m.nombre_medico, m.apellido_medico 
        FROM medicos m
        INNER JOIN medico_tratamiento mt ON mt.id_medico = m.id_medico
        WHERE mt.id_tratamiento = ?
          AND m.id_clinica = ?
      `,
        [tratamiento.id_tratamiento, id_clinica]
      );
      medicos = medicosResult;
    } catch (error) {
      console.error(`Error al obtener médicos para el tratamiento ${tratamiento.nombre_tratamiento}:`, error);
      throw ERRORS.QUERY_ERROR(error);
    }

    if (medicos.length === 0) {
      console.warn(ERRORS.NO_DOCTORS_FOUND(tratamiento.nombre_tratamiento).message);
      throw ERRORS.NO_DOCTORS_FOUND(tratamiento.nombre_tratamiento);
    }

    const medicosConEspaciosPromises = medicos.map(async (medico) => {
      console.log(`Procesando médico: ${medico.nombre_medico} ${medico.apellido_medico}`);

      let espacios;
      try {
        const [espaciosResult] = await executeWithRetry(connection,
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
        espacios = espaciosResult;
      } catch (error) {
        console.error(`Error al obtener espacios para el médico ${medico.nombre_medico}:`, error);
        throw ERRORS.QUERY_ERROR(error);
      }

      if (espacios.length === 0) {
        console.warn(ERRORS.NO_SPACES_FOUND(medico.nombre_medico).message);
        throw ERRORS.NO_SPACES_FOUND(medico.nombre_medico);
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
    console.warn(ERRORS.NO_RESULTS_FOUND.message);
    throw ERRORS.NO_RESULTS_FOUND;
  }

  return result;
}

module.exports = { getTratamientosData };
