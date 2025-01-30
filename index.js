const { obtenerPoolBD } = require("./base_de_datos/conexionBD");
const { generarConsultasSQL } = require("./utilidades/generadorSQL");
const ajustarDisponibilidad = require("./utilidades/ajustarDisponibilidad");
const servicioTratamientos = require("./servicios/servicioTratamientos");
const calcularDisponibilidad = require("./utilidades/calcularDisponibilidad");
const ERRORES = require("./utilidades/errores");

// Importamos la versión centralizada de ejecutarConReintento
const { ejecutarConReintento } = require("./utilidades/ejecutarConReintento");

exports.handler = async (event) => {
  console.log("Evento recibido:", JSON.stringify(event));
  
  // Obtenemos el pool (opcional si requieres para otra lógica),
  // pero notarás que ejecutarConReintento se encarga de eso internamente.
  const poolBD = obtenerPoolBD();

  let body = event.body;
  if (event.isBase64Encoded) {
    body = Buffer.from(body, "base64").toString("utf-8");
  }

  try {
    const datosEntrada = JSON.parse(body);
    const {
      tratamientos: tratamientosConsultados,
      fechas: fechasSeleccionadas,
      id_clinica,
      tiempo_actual,
    } = datosEntrada;

    // Validaciones iniciales
    if (!id_clinica) {
      throw ERRORES.FALTA_ID_CLINICA;
    }
    if (!Array.isArray(tratamientosConsultados) || tratamientosConsultados.length === 0) {
      throw ERRORES.NINGUN_TRATAMIENTO_SELECCIONADO;
    }
    if (!Array.isArray(fechasSeleccionadas) || fechasSeleccionadas.length === 0) {
      throw ERRORES.NINGUNA_FECHA_SELECCIONADA;
    }

    console.log("Datos de entrada procesados correctamente.");

    let datosTratamientos;
    try {
      // Ajustamos la llamada a la firma de la función en servicioTratamientos
      datosTratamientos = await servicioTratamientos.obtenerDatosTratamientos({
        id_clinica,
        tratamientosConsultados,
      });
    } catch (error) {
      console.error("Error al obtener tratamientos:", error);
      throw error; // Re-lanzamos para que el 'catch' principal lo maneje
    }

    console.log("Tratamientos obtenidos:", JSON.stringify(datosTratamientos));

    // Extraer IDs de médicos y espacios
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

    if (idsMedicos.length === 0) {
      throw ERRORES.NINGUN_MEDICO_ENCONTRADO;
    }
    if (idsEspacios.length === 0) {
      throw ERRORES.NINGUN_ESPACIO_ENCONTRADO;
    }

    // Generar las consultas con la utilidad
    const consultasSQL = generarConsultasSQL({
      fechas: fechasSeleccionadas,
      id_medicos: idsMedicos,
      id_espacios: idsEspacios,
      id_clinica,
    });

    console.log("Consultas SQL generadas:", JSON.stringify(consultasSQL));

    // Ejecutar las 3 consultas
    let citas, progMedicos, progEspacios;
    try {
      citas = await ejecutarConReintento(consultasSQL.sql_citas, []);
      progMedicos = await ejecutarConReintento(consultasSQL.sql_prog_medicos, []);
      progEspacios = await ejecutarConReintento(consultasSQL.sql_prog_espacios, []);
    } catch (error) {
      console.error("Error al ejecutar consultas SQL:", error);
      throw ERRORES.ERROR_CONSULTA_SQL(error);
    }

    console.log("Datos obtenidos de la base de datos:", { citas, progMedicos, progEspacios });

    if (!progMedicos || progMedicos.length === 0) {
      throw ERRORES.NO_PROG_MEDICOS;
    }
    if (!progEspacios || progEspacios.length === 0) {
      throw ERRORES.NO_PROG_ESPACIOS;
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

    // Ajustar según la hora actual
    const disponibilidadAjustada = ajustarDisponibilidad(disponibilidad, tiempo_actual);
    if (disponibilidadAjustada.length === 0) {
      throw ERRORES.SIN_HORARIOS_DISPONIBLES;
    }

    console.log("Disponibilidad final ajustada:", JSON.stringify(disponibilidadAjustada));

    // Éxito
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

    // Manejo de códigos de error y status HTTP
    const codigoError = error.code || "";
    let statusHTTP = 500;
    
    if (codigoError.startsWith("ERR1")) statusHTTP = 400;
    else if (codigoError.startsWith("ERR2") || codigoError.startsWith("ERR3")) statusHTTP = 404;
    else if (codigoError.startsWith("ERR4")) statusHTTP = 500;
    else if (codigoError.startsWith("ERR5")) statusHTTP = 500;

    // Respuesta de error
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
