// src/servicios/servicioTratamientos.js
const ERRORES = require("../utilidades/errores");

const ejecutarConReintento = async (conexion, consulta, parametros = [], reintentos = 3) => {
  for (let intento = 1; intento <= reintentos; intento++) {
    try {
      return await conexion.execute(consulta, parametros);
    } catch (error) {
      if (error.code === "ER_CLIENT_INTERACTION_TIMEOUT" && intento < reintentos) {
        console.warn(`Timeout en intento ${intento}, reintentando...`);
        await new Promise((res) => setTimeout(res, 1000));
      } else {
        throw ERRORES.ERROR_CONSULTA_SQL(error);
      }
    }
  }
};

async function obtenerDatosTratamientos(conexion, { id_clinica, tratamientosConsultados }) {
  console.log("Iniciando la consulta de tratamientos...");

  // Verificar conexión
  try {
    await conexion.ping();
  } catch (err) {
    console.error("Conexión cerrada, reintentando...");
    throw ERRORES.CONEXION_BD;
  }

  // Consultar tratamientos
  let tratamientosEncontrados;
  try {
    const matchAgainst = tratamientosConsultados.join(" ");
    const marcadoresExactos = tratamientosConsultados.map(() => "LOWER(TRIM(?))").join(", ");

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

    const [resultados] = await ejecutarConReintento(conexion, consultaSQL, parametros);
    tratamientosEncontrados = resultados;
  } catch (error) {
    console.error("Error al ejecutar la consulta de tratamientos:", error);
    throw ERRORES.ERROR_CONSULTA_SQL(error);
  }

  if (tratamientosEncontrados.length === 0) {
    console.warn(ERRORES.TRATAMIENTOS_NO_ENCONTRADOS([]).message);
    // Llamamos con array vacío para mantener la coherencia de la función
    throw ERRORES.TRATAMIENTOS_NO_ENCONTRADOS([]);
  }

  console.warn("tratamientosEncontrados", tratamientosEncontrados);

  // Filtrar solo los tratamientos con coincidencia exacta
  const tratamientosExactos = tratamientosEncontrados.filter((ft) => ft.es_exacto == 1);
  if (tratamientosExactos.length === 0) {
    console.warn(ERRORES.TRATAMIENTOS_NO_EXACTOS(tratamientosConsultados).message);
    throw ERRORES.TRATAMIENTOS_NO_EXACTOS(tratamientosConsultados);
  }

  // Procesar cada tratamiento para obtener médicos y espacios
  const promesasTratamientos = tratamientosExactos.map(async (tratamiento) => {
    console.log("Procesando tratamiento:", tratamiento.nombre_tratamiento);

    // Obtener médicos para este tratamiento
    let medicos;
    try {
      const [resultadosMedicos] = await ejecutarConReintento(
        conexion,
        `
          SELECT m.id_medico, m.nombre_medico, m.apellido_medico 
          FROM medicos m
          INNER JOIN medico_tratamiento mt ON mt.id_medico = m.id_medico
          WHERE mt.id_tratamiento = ?
            AND m.id_clinica = ?
        `,
        [tratamiento.id_tratamiento, id_clinica]
      );
      medicos = resultadosMedicos;
    } catch (error) {
      console.error(`Error al obtener médicos para el tratamiento ${tratamiento.nombre_tratamiento}:`, error);
      throw ERRORES.ERROR_CONSULTA_SQL(error);
    }

    if (medicos.length === 0) {
      console.warn(ERRORES.NINGUN_MEDICO_ENCONTRADO.message);
      // Para más contexto, podemos mostrar el nombre del tratamiento
      throw ERRORES.NINGUN_MEDICO_ENCONTRADO;
    }

    // Para cada médico, obtener los espacios asociados
    const promesasMedicos = medicos.map(async (medico) => {
      console.log(`Procesando médico: ${medico.nombre_medico} ${medico.apellido_medico}`);

      let espacios;
      try {
        const [resultadosEspacios] = await ejecutarConReintento(
          conexion,
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
        espacios = resultadosEspacios;
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

    return {
      tratamiento: {
        id_tratamiento: tratamiento.id_tratamiento,
        nombre_tratamiento: tratamiento.nombre_tratamiento,
        duracion_tratamiento: tratamiento.duracion_tratamiento,
      },
      medicos: medicosConEspacios,
    };
  });

  let resultadoFinal;
  try {
    resultadoFinal = await Promise.all(promesasTratamientos);
  } catch (error) {
    console.error("Error al procesar tratamientos en paralelo:", error);
    throw error;
  }

  // Si después de procesarlos todos, no queda nada, se lanza error
  if (resultadoFinal.length === 0) {
    console.warn(ERRORES.SIN_HORARIOS_DISPONIBLES.message);
    throw ERRORES.SIN_HORARIOS_DISPONIBLES;
  }

  return resultadoFinal;
}

module.exports = {
  obtenerDatosTratamientos,
};
