// index.js
const { getDbPool } = require("./get_horarios_disponibles/db");
const sqlGenerator = require("./get_horarios_disponibles/sqlGenerator");
const fixAvailability = require("./get_horarios_disponibles/fixAvailability");
const tratamientosService = require("./get_horarios_disponibles/treatmentsService");
const availabilityCalculator = require("./get_horarios_disponibles/availabilityCalculator");

// Función de Retry para ejecutar consultas con reintentos
async function executeWithRetry(connection, query, params = [], retries = 3) {
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
}

exports.handler = async (event) => {
  let conn;
  let allErrorMessaeges = [];

  try {
    console.log("Evento recibido:", JSON.stringify(event));

    // Obtener conexión del pool
    const pool = getDbPool();
    conn = await pool.getConnection();

    // Leer y procesar la entrada
    let body = event.body;
    if (event.isBase64Encoded) {
      body = Buffer.from(body, "base64").toString("utf-8");
    }
    const datosEntrada = JSON.parse(body);

    const {
      tratamientos: tratamientosConsultados,
      fechas: fechasSeleccionadas,
      id_clinica,
      tiempo_actual,
    } = datosEntrada;

    if (!id_clinica) {
      const error = "[ERR100] Falta el ID de la clínica.";
      allErrorMessaeges.push(error);
      console.error(error);
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: error,
        }),
      };
    }

    if (!Array.isArray(tratamientosConsultados) || tratamientosConsultados.length === 0) {
      const error = "[ERR101] No se seleccionaron tratamientos.";
      allErrorMessaeges.push(error);
      console.error(error);
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: error,
        }),
      };
    }

    console.log("Datos de entrada procesados correctamente.");

    let tratamientosData;
    try {
      const tratamientosResponse = await tratamientosService.getTratamientosData(conn, {
        tratamientosConsultados,
        id_clinica,
      });
      tratamientosData = tratamientosResponse.result;
      allErrorMessaeges = allErrorMessaeges.concat(tratamientosResponse.errorMessaeges);

      if (tratamientosData.length === 0) {
        const error = "[ERR102] Los tratamientos consultados no existen en la base de datos: " + tratamientosConsultados.join(', ');
        allErrorMessaeges.push(error);
        console.warn(error);
        return {
          statusCode: 404,
          body: JSON.stringify({
            success: false,
            message: error,
          }),
        };
      }
    } catch (error) {
      console.error("Error al obtener tratamientos:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          message: "Error al consultar tratamientos.",
        }),
      };
    }

    console.log("Tratamientos obtenidos:", JSON.stringify(tratamientosData));

    const idMedicos = [
      ...new Set(tratamientosData.flatMap((t) => t.medicos.map((m) => m.id_medico))),
    ];
    const idEspacios = [
      ...new Set(
        tratamientosData.flatMap((t) =>
          t.medicos.flatMap((m) => m.espacios.map((e) => e.id_espacio))
        )
      ),
    ];

    if (idMedicos.length === 0) {
      const error = "[ERR103] No se encontraron médicos configurados para los tratamientos consultados: " + tratamientosConsultados.join(', ');
      allErrorMessaeges.push(error);
      console.warn(error);
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          message: error,
        }),
      };
    }

    if (idEspacios.length === 0) {
      const error = "[ERR104] No se encontraron espacios configurados para los tratamientos consultados o para algún médico.";
      allErrorMessaeges.push(error);
      console.warn(error);
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          message: error,
        }),
      };
    }

    const consultasSQL = sqlGenerator.generarConsultasSQL({
      fechas: fechasSeleccionadas,
      id_medicos: idMedicos,
      id_espacios: idEspacios,
      id_clinica,
    });

    console.log("Consultas SQL generadas:", JSON.stringify(consultasSQL));

    let citas, progMedicos, progEspacios;
    try {
      // Ejecutar las consultas en paralelo utilizando Promise.all
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
      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          message: "Error al consultar disponibilidad.",
        }),
      };
    }

    console.log("Datos obtenidos de la base de datos:", { citas, progMedicos, progEspacios });

    const inputData = {
      tratamientos: tratamientosData,
      prog_medicos: progMedicos,
      prog_espacios: progEspacios,
      citas_programadas: citas,
    };

    let disponibilidad;
    try {
      disponibilidad = availabilityCalculator(inputData);
    } catch (error) {
      console.error("Error al calcular disponibilidad:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          message: "Error en el cálculo de disponibilidad.",
        }),
      };
    }

    console.log("Disponibilidad calculada:", JSON.stringify(disponibilidad));
    console.log("Tiempo actual:", tiempo_actual);

    // Liberar la conexión
    conn.release();
    console.log("Conexión liberada.");

    const disponibilidadAjustadas = fixAvailability(disponibilidad, tiempo_actual);

    // Verificar si disponibilidadAjustadas está vacío
    if (disponibilidadAjustadas.length === 0) {
      const error = "[ERR105] No se encontraron horarios disponibles para los tratamientos buscados.";
      allErrorMessaeges.push(error);
      console.warn(error);
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          message: error,
        }),
      };
    }

    console.log("Disponibilidad calculada final:", JSON.stringify(disponibilidadAjustadas));

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        allErrorMessaeges: allErrorMessaeges.join(', '),
        analisis_agenda: disponibilidadAjustadas,
      }),
    };
  } catch (error) {
    console.error("Error en la Lambda:", error);
    if (conn) {
      conn.release();
    }
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Error interno del servidor.",
      }),
    };
  }
};

// module.exports = { handler };

// handler({
//   body: '{"id_clinica":64,"tiempo_actual":"2025-01-26T18:54:22.000Z","tratamientos":["Quiropodia"],"medicos":[],"espacios":[],"aparatologias":[],"especialidades":[],"fechas":[{"fecha":"2025-01-28","horas":[{"hora_inicio":"","hora_fin":""}]}]}'
// });