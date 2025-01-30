const { ejecutarConReintento } = require("../utilidades/ejecutarConReintento");
const ERRORES = require("../utilidades/errores");

async function obtenerDatosTratamientos({ id_clinica, tratamientosConsultados }) {
  console.log("Iniciando la consulta de tratamientos...");

  let tratamientosEncontrados;
  try {
    const matchAgainst = tratamientosConsultados.join(" ");
    const marcadoresExactos = tratamientosConsultados
      .map(() => "LOWER(TRIM(?))")
      .join(", ");

    const consultaSQL = `
      SELECT DISTINCT 
          id_tratamiento,
          nombre_tratamiento,
          duracion AS duracion_tratamiento,
          MATCH(nombre_tratamiento, descripcion) AGAINST(?) AS relevancia,
          (CASE 
              WHEN LOWER(TRIM(nombre_tratamiento)) IN (${marcadoresExactos}) THEN 1 
              ELSE 0 
           END) AS es_exacto
      FROM tratamientos
      WHERE MATCH(nombre_tratamiento, descripcion) AGAINST(?)
        AND id_clinica = ?
      ORDER BY es_exacto DESC, relevancia DESC, nombre_tratamiento ASC
    `;

    const parametros = [
      matchAgainst,
      ...tratamientosConsultados.map((tc) => tc.toLowerCase().trim()),
      matchAgainst,
      id_clinica,
    ];

    tratamientosEncontrados = await ejecutarConReintento(consultaSQL, parametros);
  } catch (error) {
    console.error("Error al ejecutar la consulta de tratamientos:", error);
    throw ERRORES.ERROR_CONSULTA_SQL(error);
  }

  if (tratamientosEncontrados.length === 0) {
    console.warn(ERRORES.TRATAMIENTOS_NO_ENCONTRADOS([]).message);
    throw ERRORES.TRATAMIENTOS_NO_ENCONTRADOS([]);
  }

  console.log("Tratamientos encontrados:", tratamientosEncontrados);

  // Filtramos solo los que coinciden "exactamente"
  const tratamientosExactos = tratamientosEncontrados.filter((ft) => ft.es_exacto == 1);
  if (tratamientosExactos.length === 0) {
    console.warn(ERRORES.TRATAMIENTOS_NO_EXACTOS(tratamientosConsultados).message);
    throw ERRORES.TRATAMIENTOS_NO_EXACTOS(tratamientosConsultados);
  }

  // Procesamos cada tratamiento
  const promesasTratamientos = tratamientosExactos.map(async (tratamiento) => {
    console.log("Procesando tratamiento:", tratamiento.nombre_tratamiento);

    // Obtener médicos
    let medicos;
    try {
      medicos = await ejecutarConReintento(
        `
        SELECT m.id_medico, m.nombre_medico, m.apellido_medico 
        FROM medicos m
        INNER JOIN medico_tratamiento mt ON mt.id_medico = m.id_medico
        WHERE mt.id_tratamiento = ?
          AND m.id_clinica = ?
        `,
        [tratamiento.id_tratamiento, id_clinica]
      );
    } catch (error) {
      console.error(`Error al obtener médicos para el tratamiento ${tratamiento.nombre_tratamiento}:`, error);
      throw ERRORES.ERROR_CONSULTA_SQL(error);
    }

    if (medicos.length === 0) {
      console.warn(ERRORES.NINGUN_MEDICO_ENCONTRADO.message);
      throw ERRORES.NINGUN_MEDICO_ENCONTRADO;
    }

    // Procesar cada médico y sus espacios
    const promesasMedicos = medicos.map(async (medico) => {
      console.log(`Procesando médico: ${medico.nombre_medico} ${medico.apellido_medico}`);

      let espacios;
      try {
        espacios = await ejecutarConReintento(
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
      } catch (error) {
        console.error(`Error al obtener espacios para el médico ${medico.nombre_medico}:`, error);
        throw ERRORES.ERROR_CONSULTA_SQL(error);
      }

      if (espacios.length === 0) {
        console.warn(ERRORES.NINGUN_ESPACIO_ENCONTRADO.message);
        throw ERRORES.NINGUN_ESPACIO_ENCONTRADO;
      }

      return {
        id_medico: medico.id_medico,
        nombre_medico: `${medico.nombre_medico} ${medico.apellido_medico}`,
        espacios,
      };
    });

    const medicosConEspacios = await Promise.all(promesasMedicos);

    // Retornamos el tratamiento con sus médicos y espacios
    return {
      tratamiento: {
        id_tratamiento: tratamiento.id_tratamiento,
        nombre_tratamiento: tratamiento.nombre_tratamiento,
        duracion_tratamiento: tratamiento.duracion_tratamiento,
      },
      medicos: medicosConEspacios,
    };
  });

  // Ejecutamos todas las promesas de tratamientos
  let resultadoFinal;
  try {
    resultadoFinal = await Promise.all(promesasTratamientos);
  } catch (error) {
    console.error("Error al procesar tratamientos en paralelo:", error);
    throw error; // Mantenemos el mismo error
  }

  if (resultadoFinal.length === 0) {
    console.warn(ERRORES.SIN_HORARIOS_DISPONIBLES.message);
    throw ERRORES.SIN_HORARIOS_DISPONIBLES;
  }

  return resultadoFinal;
}

module.exports = {
  obtenerDatosTratamientos,
};
