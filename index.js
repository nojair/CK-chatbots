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
    console.log("Conexión a la base de datos establecida.");

    // Leer y procesar la entrada
    let body = event.body;
    if (event.isBase64Encoded) {
      body = Buffer.from(body, "base64").toString("utf-8");
    }
    const datosEntrada = JSON.parse(body);

    const {
      tratamientos: tratamientosSeleccionados,
      fechas: fechasSeleccionadas,
      id_clinica,
      tiempo_actual,
    } = datosEntrada;

    if (!id_clinica) {
      console.error("Falta el ID de la clínica.");
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Ups, parece que hubo un error." }),
      };
    }

    if (!Array.isArray(tratamientosSeleccionados) || tratamientosSeleccionados.length === 0) {
      console.error("No se seleccionaron tratamientos.");
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "El mensaje no indica un tratamiento." }),
      };
    }

    console.log("Datos de entrada procesados correctamente.");

    let tratamientosData;
    try {
      tratamientosData = await tratamientosService.getTratamientosData(conn, {
        tratamientosSeleccionados,
        id_clinica,
      });

      if (tratamientosData.length === 0) {
        console.warn("No se encontraron tratamientos disponibles.");
      }
    } catch (error) {
      console.error("Error al obtener tratamientos:", error);
      throw new Error("Error al consultar tratamientos.");
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
      console.warn("No se encontraron médicos asociados a los tratamientos.");
    }

    if (idEspacios.length === 0) {
      console.warn("No se encontraron espacios asociados a los tratamientos.");
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
      throw new Error("Error al consultar disponibilidad.");
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
      throw new Error("Error en el cálculo de disponibilidad.");
    }

    console.log("Disponibilidad calculada:", JSON.stringify(disponibilidad));
    console.log("Tiempo actual:", tiempo_actual);

    conn.release();
    console.log("Conexión liberada.");

    const disponibilidadAjustadas = fixAvailability(disponibilidad, tiempo_actual);

    console.log("Disponibilidad calculada final:", JSON.stringify(disponibilidadAjustadas));


    return {
      statusCode: 200,
      body: JSON.stringify({ resultado_consulta: disponibilidadAjustadas }),
    };
  } catch (error) {
    console.error("Error en la Lambda:", error);
    if (conn) {
      conn.release();
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error interno del servidor." }),
    };
  }
};

// module.exports = { handler };

// handler({
//   body: '{"id_clinica":64,"tiempo_actual":"2025-01-26T18:54:22.000Z","tratamientos":["Quiropodia"],"medicos":[],"espacios":[],"aparatologias":[],"especialidades":[],"fechas":[{"fecha":"2025-01-28","horas":[{"hora_inicio":"","hora_fin":""}]}]}'
// });