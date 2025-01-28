const { getDbPool } = require("./get_horarios_disponibles/db");
const sqlGenerator = require("./get_horarios_disponibles/sqlGenerator");
const fixAvailability = require("./get_horarios_disponibles/fixAvailability");
const tratamientosService = require("./get_horarios_disponibles/tratamientosService");
const availabilityCalculator = require("./get_horarios_disponibles/availabilityCalculator");

exports.handler = async (event) => {
  let conn;

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
      console.error("Falta el ID de la clínica.");
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "Falta el ID de la clínica.",
        }),
      };
    }

    if (!Array.isArray(tratamientosConsultados) || tratamientosConsultados.length === 0) {
      console.error("No se seleccionaron tratamientos.");
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "El mensaje no indica un tratamiento.",
        }),
      };
    }

    console.log("Datos de entrada procesados correctamente.");

    let tratamientosData;
    try {
      tratamientosData = await tratamientosService.getTratamientosData(conn, {
        tratamientosConsultados,
        id_clinica,
      });

      if (tratamientosData.length === 0) {
        console.warn("Los tratamientos consultados no existen en la base de datos." + tratamientosConsultados.join(', '));
        return {
          statusCode: 404,
          body: JSON.stringify({
            success: false,
            message: "Los tratamientos consultados no existen en la base de datos." + tratamientosConsultados.join(', '),
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
      console.warn("No se encontraron médicos configurados para los tratamientos consultados." + tratamientosConsultados.join(', '));
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          message: "No se encontraron médicos configurados para los tratamientos consultados." + tratamientosConsultados.join(', '),
        }),
      };
    }

    if (idEspacios.length === 0) {
      const nombresMedicos = idMedicos.map(id => w.map(t => t.medicos.find(m => m.id_medico == id))[0]?.nombre_medico).join(', ');
      console.warn("No se encontraron espacios configurados para los tratamientos consultados o a uno de los médicos " + nombresMedicos);
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          message: "No se encontraron espacios configurados para los tratamientos consultados o a uno de los médicos " + nombresMedicos,
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
      [citas] = await conn.query(consultasSQL.sql_citas);
      [progMedicos] = await conn.query(consultasSQL.sql_prog_medicos);
      [progEspacios] = await conn.query(consultasSQL.sql_prog_espacios);
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

    conn.release();
    console.log("Conexión liberada.");

    const disponibilidadAjustadas = fixAvailability(disponibilidad, tiempo_actual);

    // Verificar si disponibilidadAjustadas está vacío
    if (disponibilidadAjustadas.length === 0) {
      console.warn("No se encontraron horarios disponibles para los tratamientos buscados.");
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          message: "No se encontraron horarios disponibles para los tratamientos buscados.",
        }),
      };
    }

    console.log("Disponibilidad calculada final:", JSON.stringify(disponibilidadAjustadas));

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
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