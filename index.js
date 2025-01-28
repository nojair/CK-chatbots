const { getDbPool } = require("./get_horarios_disponibles/db");
const sqlGenerator = require("./get_horarios_disponibles/sqlGenerator");
const fixAvailability = require("./get_horarios_disponibles/fixAvailability");
const tratamientosService = require("./get_horarios_disponibles/tratamientosService");
const availabilityCalculator = require("./get_horarios_disponibles/availabilityCalculator");

exports.handler = async (event) => {
  let conn;

  try {
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
      tratamientos: tratamientosSeleccionados,
      fechas: fechasSeleccionadas,
      id_clinica,
      tiempo_actual
    } = datosEntrada;

    // Validar datos de entrada
    if (!id_clinica) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Ups, parece que hubo un error" }),
      };
    }

    if (!Array.isArray(tratamientosSeleccionados) || tratamientosSeleccionados.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "El mensaje no indica un tratamiento." }),
      };
    }

    // Obtener JSON estructurado con tratamientos, médicos, y espacios
    const tratamientosData = await tratamientosService.getTratamientosData(conn, {
      tratamientosSeleccionados,
      id_clinica,
    });

    console.log('============== TRATAMIENTOS > MÉDICOS > ESPACIOS ==============');
    console.dir(tratamientosData, { depth: null, colors: true });
    console.log('===============================================================');

    // Extraer IDs de médicos y espacios del JSON de tratamientosData
    const idMedicos = [
      ...new Set(tratamientosData.flatMap(t => t.medicos.map(m => m.id_medico))),
    ];
    const idEspacios = [
      ...new Set(tratamientosData.flatMap(t => t.medicos.flatMap(m => m.espacios.map(e => e.id_espacio)))),
    ];

    // Generar las consultas SQL necesarias con los datos extraídos
    const consultasSQL = sqlGenerator.generarConsultasSQL({
      fechas: fechasSeleccionadas,
      id_medicos: idMedicos,
      id_espacios: idEspacios,
      id_clinica
    });

    console.log('============== CONSULTAS SQL ==============');
    console.dir(consultasSQL, { depth: null, colors: true });
    console.log('===========================================');

    // Ejecutar las consultas SQL
    const [citas] = await conn.query(consultasSQL.sql_citas);
    const [progMedicos] = await conn.query(consultasSQL.sql_prog_medicos);
    const [progEspacios] = await conn.query(consultasSQL.sql_prog_espacios);

    // Usar directamente `tratamientosData` para construir el input del cálculo de disponibilidad
    const inputData = {
      tratamientos: tratamientosData,
      prog_medicos: progMedicos,
      prog_espacios: progEspacios,
      citas_programadas: citas,
    };

    console.log('======== DATA TO CALCULATE AVAILABILITY ========');
    console.dir(inputData, { depth: null, colors: true });
    console.log('================================================');

    // Calcular la disponibilidad
    const disponibilidad = availabilityCalculator(inputData);

    console.log('================= AVAILABILITY =================');
    console.dir(disponibilidad, { depth: null, colors: true });
    console.log('================================================');

    // Liberar la conexión después de realizar las operaciones
    conn.release();

    const disponibilidadAjustadas = fixAvailability(disponibilidad, tiempo_actual);

    const disponibilidad_to_base64 = Buffer.from(JSON.stringify(disponibilidadAjustadas), 'utf-8').toString('base64');

    return {
      statusCode: 200,
      body: JSON.stringify({ resultado_consulta: disponibilidad_to_base64 }),
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