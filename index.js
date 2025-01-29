// src/manejadorPrincipal.js
const { obtenerPoolBD } = require("./base_de_datos/conexionBD");
const { generarConsultasSQL } = require("./utilidades/generadorSQL");
const ajustarDisponibilidad = require("./utilidades/ajustarDisponibilidad");
const servicioTratamientos = require("./servicios/servicioTratamientos");
const calcularDisponibilidad = require("./utilidades/calcularDisponibilidad");
const ERRORES = require("./utilidades/errores");

async function ejecutarConReintento(conexion, consulta, parametros = [], reintentos = 3) {
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
}

exports.handler = async (event) => {
  let conexion;

  try {
    console.log("Evento recibido:", JSON.stringify(event));

    const poolBD = obtenerPoolBD();
    conexion = await poolBD.getConnection();

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

    if (!id_clinica) throw ERRORES.FALTA_ID_CLINICA;
    if (!Array.isArray(tratamientosConsultados) || tratamientosConsultados.length === 0) {
      throw ERRORES.NINGUN_TRATAMIENTO_SELECCIONADO;
    }
    if (!Array.isArray(fechasSeleccionadas) || fechasSeleccionadas.length === 0) {
      throw ERRORES.NINGUNA_FECHA_SELECCIONADA;
    }

    console.log("Datos de entrada procesados correctamente.");

    let datosTratamientos;
    try {
      datosTratamientos = await servicioTratamientos.obtenerDatosTratamientos(conexion, {
        tratamientosConsultados,
        id_clinica,
      });
    } catch (error) {
      console.error("Error al obtener tratamientos:", error);
      throw error;
    }

    console.log("Tratamientos obtenidos:", JSON.stringify(datosTratamientos));

    const idsMedicos = [
      ...new Set(datosTratamientos.flatMap((t) => t.medicos.map((m) => m.id_medico))),
    ];
    const idsEspacios = [
      ...new Set(
        datosTratamientos.flatMap((t) =>
          t.medicos.flatMap((m) => m.espacios.map((e) => e.id_espacio))
        )
      ),
    ];

    if (idsMedicos.length === 0) throw ERRORES.NINGUN_MEDICO_ENCONTRADO;
    if (idsEspacios.length === 0) throw ERRORES.NINGUN_ESPACIO_ENCONTRADO;

    const consultasSQL = generarConsultasSQL({
      fechas: fechasSeleccionadas,
      id_medicos: idsMedicos,
      id_espacios: idsEspacios,
      id_clinica,
    });

    console.log("Consultas SQL generadas:", JSON.stringify(consultasSQL));

    let citas, progMedicos, progEspacios;
    try {
      const [resultadoCitas, resultadoProgMedicos, resultadoProgEspacios] = await Promise.all([
        ejecutarConReintento(conexion, consultasSQL.sql_citas, [], 3),
        ejecutarConReintento(conexion, consultasSQL.sql_prog_medicos, [], 3),
        ejecutarConReintento(conexion, consultasSQL.sql_prog_espacios, [], 3),
      ]);

      [citas] = resultadoCitas;
      [progMedicos] = resultadoProgMedicos;
      [progEspacios] = resultadoProgEspacios;
    } catch (error) {
      console.error("Error al ejecutar consultas SQL:", error);
      throw ERRORES.ERROR_CONSULTA_SQL(error);
    }

    console.log("Datos obtenidos de la base de datos:", {
      citas,
      progMedicos,
      progEspacios,
    });

    if (!progMedicos || progMedicos.length === 0) {
      throw ERRORES.NO_PROG_MEDICOS;
    }

    if (!progEspacios || progEspacios.length === 0) {
      throw ERRORES.NO_PROG_ESPACIOS;
    }

    let disponibilidad;
    try {
      disponibilidad = calcularDisponibilidad({
        tratamientos: datosTratamientos,
        citas_programadas: citas,
        prog_medicos: progMedicos,
        prog_espacios: progEspacios,
      });
    } catch (error) {
      console.error("Error al calcular disponibilidad:", error);
      throw ERRORES.ERROR_CALCULO_DISPONIBILIDAD;
    }

    conexion.release();

    const disponibilidadAjustada = ajustarDisponibilidad(disponibilidad, tiempo_actual);
    if (disponibilidadAjustada.length === 0) throw ERRORES.SIN_HORARIOS_DISPONIBLES;

    console.log("Disponibilidad final ajustada:", JSON.stringify(disponibilidadAjustada));

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: null,
        analisis_agenda: disponibilidadAjustada,
      }),
    };
  } catch (error) {
    console.error("Error en la ejecución del Lambda:", error);

    if (conexion) conexion.release();

    const codigoError = error.code || "";
    let statusHTTP = 500;
    if (codigoError.startsWith("ERR1")) statusHTTP = 400;
    else if (codigoError.startsWith("ERR2") || codigoError.startsWith("ERR3")) statusHTTP = 404;
    else if (codigoError.startsWith("ERR4")) statusHTTP = 500;
    else if (codigoError.startsWith("ERR5")) statusHTTP = 500;

    return {
      statusCode: statusHTTP,
      body: JSON.stringify({
        success: false,
        message: error.message || ERRORES.ERROR_INTERNO_SERVIDOR.message,
        analisis_agenda: [],
      }),
    };
  }
};
