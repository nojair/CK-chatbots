const { getDbPool } = require("./get_horarios_disponibles/db");
const sqlGenerator = require("./get_horarios_disponibles/sqlGenerator");
const fixAvailability = require("./get_horarios_disponibles/fixAvailability");
const tratamientosService = require("./get_horarios_disponibles/treatmentsService");
const availabilityCalculator = require("./get_horarios_disponibles/availabilityCalculator");
const ERRORS = require("./get_horarios_disponibles/errors");

async function executeWithRetry(connection, query, params = [], retries = 3) {
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
}

exports.handler = async (event) => {
  let conn;

  try {
    console.log("Evento recibido:", JSON.stringify(event));

    // Obtener conexión a la base de datos
    const pool = getDbPool();
    conn = await pool.getConnection();

    // Decodificar body si está en base64
    let body = event.body;
    if (event.isBase64Encoded) {
      body = Buffer.from(body, "base64").toString("utf-8");
    }
    const datosEntrada = JSON.parse(body);

    const { tratamientos: tratamientosConsultados, fechas: fechasSeleccionadas, id_clinica, tiempo_actual } = datosEntrada;

    // Validar que los datos obligatorios estén presentes
    if (!id_clinica) throw ERRORS.MISSING_CLINIC_ID;
    if (!Array.isArray(tratamientosConsultados) || tratamientosConsultados.length === 0) throw ERRORS.NO_TREATMENTS_SELECTED;
    if (!Array.isArray(fechasSeleccionadas) || fechasSeleccionadas.length === 0) throw ERRORS.NO_DATES_SELECTED;

    console.log("Datos de entrada procesados correctamente.");

    // Obtener datos de tratamientos
    let tratamientosData;
    try {
      tratamientosData = await tratamientosService.getTratamientosData(conn, {
        tratamientosConsultados,
        id_clinica,
      });

      if (tratamientosData.length === 0) {
        throw ERRORS.NO_TREATMENTS_FOUND(tratamientosConsultados);
      }
    } catch (error) {
      console.error("Error al obtener tratamientos:", error);
      throw error;
    }

    console.log("Tratamientos obtenidos:", JSON.stringify(tratamientosData));

    // Obtener médicos y espacios relacionados
    const idMedicos = [...new Set(tratamientosData.flatMap((t) => t.medicos.map((m) => m.id_medico)))];
    const idEspacios = [...new Set(tratamientosData.flatMap((t) => t.medicos.flatMap((m) => m.espacios.map((e) => e.id_espacio))))];

    if (idMedicos.length === 0) throw ERRORS.NO_DOCTORS_FOUND;
    if (idEspacios.length === 0) throw ERRORS.NO_SPACES_FOUND;

    // Generar consultas SQL para obtener disponibilidad
    const consultasSQL = sqlGenerator.generarConsultasSQL({
      fechas: fechasSeleccionadas,
      id_medicos: idMedicos,
      id_espacios: idEspacios,
      id_clinica,
    });

    console.log("Consultas SQL generadas:", JSON.stringify(consultasSQL));

    // Ejecutar consultas SQL
    let citas, progMedicos, progEspacios;
    try {
      const [citasResult, progMedicosResult, progEspaciosResult] = await Promise.all([
        executeWithRetry(conn, consultasSQL.sql_citas, [], 3),
        executeWithRetry(conn, consultasSQL.sql_prog_medicos, [], 3),
        executeWithRetry(conn, consultasSQL.sql_prog_espacios, [], 3),
      ]);

      [citas] = citasResult;
      [progMedicos] = progMedicosResult;
      [progEspacios] = progEspaciosResult;
    } catch (error) {
      console.error("Error al ejecutar consultas SQL:", error);
      throw ERRORS.QUERY_ERROR(error);
    }

    console.log("Datos obtenidos de la base de datos:", { citas, progMedicos, progEspacios });

    // Calcular disponibilidad
    let disponibilidad;
    try {
      disponibilidad = availabilityCalculator({
        tratamientos: tratamientosData,
        prog_medicos: progMedicos,
        prog_espacios: progEspacios,
        citas_programadas: citas,
      });
    } catch (error) {
      console.error("Error al calcular disponibilidad:", error);
      throw ERRORS.AVAILABILITY_CALCULATION_ERROR;
    }

    conn.release();

    // Ajustar disponibilidad según la hora actual
    const disponibilidadAjustadas = fixAvailability(disponibilidad, tiempo_actual);

    if (disponibilidadAjustadas.length === 0) throw ERRORS.NO_AVAILABLE_SLOTS;

    console.log("Disponibilidad final ajustada:", JSON.stringify(disponibilidadAjustadas));

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        errorMessage: null,
        analisis_agenda: disponibilidadAjustadas,
      }),
    };
  } catch (error) {
    console.error("Error en la Lambda:", error);

    if (conn) conn.release();

    return {
      statusCode: error.code?.startsWith("ERR1") ? 400 : error.code?.startsWith("ERR2") || error.code?.startsWith("ERR3") ? 404 : 500,
      body: JSON.stringify({
        success: false,
        errorMessage: error.message || ERRORS.INTERNAL_SERVER_ERROR.message,
        analisis_agenda: [],
      }),
    };
  }
};

// module.exports = { handler };

// handler({
//   body: '{"id_clinica":64,"tiempo_actual":"2025-01-26T18:54:22.000Z","tratamientos":["Quiropodia"],"medicos":[],"espacios":[],"aparatologias":[],"especialidades":[],"fechas":[{"fecha":"2025-01-28","horas":[{"hora_inicio":"","hora_fin":""}]}]}'
// });