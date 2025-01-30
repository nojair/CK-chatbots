const AppError = require("./utilidades/AppError");
const { generarConsultasSQL } = require("./utilidades/generadorSQL");
const servicioTratamientos = require("./servicios/servicioTratamientos");
const ajustarDisponibilidad = require("./utilidades/ajustarDisponibilidad");
const calcularDisponibilidad = require("./utilidades/calcularDisponibilidad");
const { ejecutarConReintento } = require("./utilidades/ejecutarConReintento");

exports.handler = async (event) => {
  console.log("Evento recibido:", JSON.stringify(event));
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

    if (!id_clinica) throw AppError.FALTA_ID_CLINICA();
    if (!Array.isArray(tratamientosConsultados) || tratamientosConsultados.length === 0) {
      throw AppError.NINGUN_TRATAMIENTO_SELECCIONADO();
    }
    if (!Array.isArray(fechasSeleccionadas) || fechasSeleccionadas.length === 0) {
      throw AppError.NINGUNA_FECHA_SELECCIONADA();
    }

    console.log("Datos de entrada procesados correctamente.");

    let datosTratamientos;
    try {
      datosTratamientos = await servicioTratamientos.obtenerDatosTratamientos({
        id_clinica,
        tratamientosConsultados,
      });
    } catch (error) {
      console.error(error.toString());
      throw error;
    }

    console.log("Tratamientos obtenidos:", JSON.stringify(datosTratamientos));

    const idsMedicos = [
      ...new Set(datosTratamientos.flatMap((t) => t.medicos.map((m) => m.id_medico))),
    ];
    const idsEspacios = [
      ...new Set(
        datosTratamientos.flatMap((t) =>
          t.medicos.flatMap((m) => m.espacios.map((e) => e.id_espacio)),
        ),
      ),
    ];

    if (idsMedicos.length === 0) throw AppError.NINGUN_MEDICO_ENCONTRADO();
    if (idsEspacios.length === 0) throw AppError.NINGUN_ESPACIO_ENCONTRADO();

    const consultasSQL = generarConsultasSQL({
      fechas: fechasSeleccionadas,
      id_medicos: idsMedicos,
      id_espacios: idsEspacios,
      id_clinica,
    });

    console.log("Consultas SQL generadas:", JSON.stringify(consultasSQL));

    let citas, progMedicos, progEspacios;
    try {
      citas = await ejecutarConReintento(consultasSQL.sql_citas, []);
      progMedicos = await ejecutarConReintento(consultasSQL.sql_prog_medicos, []);
      progEspacios = await ejecutarConReintento(consultasSQL.sql_prog_espacios, []);
    } catch (error) {
      console.error(error.toString());
      if (error instanceof AppError) throw error;
      throw AppError.ERROR_CONSULTA_SQL(error);
    }

    if (!progMedicos || progMedicos.length === 0) {
      throw AppError.NO_PROG_MEDICOS(idsMedicos, fechasSeleccionadas.map((f) => f.fecha));
    }
    if (!progEspacios || progEspacios.length === 0) {
      throw AppError.NO_PROG_ESPACIOS(idsEspacios, fechasSeleccionadas.map((f) => f.fecha));
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
      console.error(error.toString());
      throw AppError.ERROR_CALCULO_DISPONIBILIDAD();
    }

    const disponibilidadAjustada = ajustarDisponibilidad(disponibilidad, tiempo_actual);
    if (disponibilidadAjustada.length === 0) {
      throw AppError.SIN_HORARIOS_DISPONIBLES(
        tratamientosConsultados.join(", "),
        idsMedicos,
        idsEspacios,
      );
    }

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
    console.error("Error capturado en Lambda:", error.toString());

    if (error instanceof AppError) {
      if (error.isLogOnly) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            message: error.message,
            analisis_agenda: [],
          }),
        };
      }

      let statusHTTP = 500;
      if (error.code.startsWith("ERR1")) statusHTTP = 400;
      else if (error.code.startsWith("ERR2") || error.code.startsWith("ERR3")) statusHTTP = 404;
      else if (error.code.startsWith("ERR4")) statusHTTP = 500;
      else if (error.code.startsWith("ERR5")) statusHTTP = 500;

      return {
        statusCode: statusHTTP,
        body: JSON.stringify(error.toJSON()),
      };
    }

    console.error("Error no controlado:", error);
    const errDesconocido = AppError.ERROR_DESCONOCIDO(error);
    return {
      statusCode: 500,
      body: JSON.stringify(errDesconocido.toJSON()),
    };
  }
};
