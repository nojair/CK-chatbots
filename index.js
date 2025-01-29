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

    // Decodificar body si está en base64
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

    // Validaciones
    if (!id_clinica) throw ERRORES.FALTA_ID_CLINICA;
    if (!Array.isArray(tratamientosConsultados) || tratamientosConsultados.length === 0) {
      throw ERRORES.NINGUN_TRATAMIENTO_SELECCIONADO;
    }
    if (!Array.isArray(fechasSeleccionadas) || fechasSeleccionadas.length === 0) {
      throw ERRORES.NINGUNA_FECHA_SELECCIONADA;
    }

    console.log("Datos de entrada procesados correctamente.");

    // Obtener datos de tratamientos
    let datosTratamientos;
    try {
      datosTratamientos = await servicioTratamientos.obtenerDatosTratamientos(conexion, {
        tratamientosConsultados,
        id_clinica,
      });
      // Si retorna array vacío ya hemos manejado el error dentro del servicio
    } catch (error) {
      console.error("Error al obtener tratamientos:", error);
      throw error;
    }

    console.log("Tratamientos obtenidos:", JSON.stringify(datosTratamientos));

    // Obtener lista de médicos y espacios
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

    // Generar consultas SQL
    const consultasSQL = generarConsultasSQL({
      fechas: fechasSeleccionadas,
      id_medicos: idsMedicos,
      id_espacios: idsEspacios,
      id_clinica,
    });

    console.log("Consultas SQL generadas:", JSON.stringify(consultasSQL));

    // Ejecutar consultas de disponibilidad
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

    // Verificar si progMedicos o progEspacios son arreglos vacíos
    if (!progMedicos || progMedicos.length === 0) {
      throw ERRORES.NO_PROG_MEDICOS; // O usa el error que prefieras
    }

    if (!progEspacios || progEspacios.length === 0) {
      throw ERRORES.NO_PROG_ESPACIOS; // O el error que prefieras
    }

    // Calcular disponibilidad
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

    // Liberar la conexión
    conexion.release();

    // Ajustar disponibilidad en función de la hora actual
    const disponibilidadAjustada = ajustarDisponibilidad(disponibilidad, tiempo_actual);
    if (disponibilidadAjustada.length === 0) throw ERRORES.SIN_HORARIOS_DISPONIBLES;

    console.log("Disponibilidad final ajustada:", JSON.stringify(disponibilidadAjustada));

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        errorMessage: null,
        analisis_agenda: disponibilidadAjustada,
      }),
    };
  } catch (error) {
    console.error("Error en la ejecución del Lambda:", error);

    if (conexion) conexion.release();

    // Determinar código de estado según prefijo del código de error
    const codigoError = error.code || "";
    let statusHTTP = 500; // Por defecto
    if (codigoError.startsWith("ERR1")) statusHTTP = 400; // Errores 1XX → entrada de datos
    else if (codigoError.startsWith("ERR2") || codigoError.startsWith("ERR3")) statusHTTP = 404; // Errores 2XX/3XX → datos no encontrados/disponibilidad
    else if (codigoError.startsWith("ERR4")) statusHTTP = 500; // Infraestructura
    else if (codigoError.startsWith("ERR5")) statusHTTP = 500; // Internos
    // Se puede ajustar la lógica según tus necesidades.

    return {
      statusCode: statusHTTP,
      body: JSON.stringify({
        success: false,
        errorMessage: error.message || ERRORES.ERROR_INTERNO_SERVIDOR.message,
        analisis_agenda: [],
      }),
    };
  }
};
