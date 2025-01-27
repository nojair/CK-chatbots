const { getDbPool } = require("./db");
const sqlGenerator = require("./sqlGenerator");
const tratamientosService = require("./tratamientosService");
const availabilityCalculator = require("./availabilityCalculator");

const handler = async (event) => {
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
      id_clinica
    } = datosEntrada;

    // Aquí tomamos el ID de la clínica y de la superclínica
    if (!id_clinica) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Ups, parece que hubo un error" }),
      };
    }

    if (!Array.isArray(tratamientosSeleccionados) || tratamientosSeleccionados.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "El mensaje no indica un tratamientos." }),
      };
    }

    // Obtener JSON estructurado con tratamientos, médicos, espacios y otros datos necesarios
    const tratamientosData = await tratamientosService.getTratamientosData(conn,
      {
        tratamientosSeleccionados,
        id_clinica
      }
    );
    
    // Obtener los datos necesarios para availabilityCalculator
    const prog_medicos = await sqlGenerator.getProgramacionMedicos(conn, id_clinica);
    const prog_espacios = await sqlGenerator.getProgramacionEspacios(conn, id_clinica);
    const citas_programadas = await sqlGenerator.getCitasProgramadas(conn, id_clinica);
    const medicos = await sqlGenerator.getMedicos(conn, id_clinica);
    const espacios = await sqlGenerator.getEspacios(conn, id_clinica);
    const medico_espacio = await sqlGenerator.getMedicoEspacio(conn, id_clinica);
    const espacio_tratamiento = await sqlGenerator.getEspacioTratamiento(conn, id_clinica);
    
    // Construir el objeto de entrada para availabilityCalculator
    const inputData = {
      tratamientos: tratamientosData,
      prog_medicos,
      prog_espacios,
      citas_programadas,
      medicos,
      espacios,
      medico_espacio,
      espacio_tratamiento,
    };

    console.dir(inputData, { depth: null, colors: true });
    return 0;

    // Calcular la disponibilidad con availabilityCalculator
    const disponibilidad = availabilityCalculator(inputData);

    // Construir y ejecutar consultas SQL
    const resultadosSQL = await sqlGenerator.buildAndExecuteQueries(
      conn,
      tratamientosData,
      { ...datosEntrada, id_clinica }
    );

    // Liberar la conexión después de realizar las operaciones
    conn.release();

    return {
      statusCode: 200,
      body: JSON.stringify({ tratamientosData, disponibilidad, resultadosSQL }),
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

handler({
  body: '{"id_clinica":64,"tiempo_actual":"2025-01-26T18:54:22.000Z","tratamientos":["Quiropodia", "Primera consulta dermatológica (quiropodia)"],"medicos":[],"espacios":[],"aparatologias":[],"especialidades":[],"fechas":[{"fecha":"2025-01-28","horas":[{"hora_inicio":"","hora_fin":""}]}]}'
});
