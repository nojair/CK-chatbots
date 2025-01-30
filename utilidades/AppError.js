class AppError extends Error {
  constructor({ code, humanMessage, context = {}, isLogOnly = false }) {
    super(humanMessage);
    this.name = "AppError";
    this.code = code;
    this.context = context;
    this.isLogOnly = isLogOnly;

    Error.captureStackTrace?.(this, this.constructor);
  }

  /**
   * Convierte el error a un objeto que se puede enviar al cliente.
   */
  toJSON() {
    return {
      success: false,
      code: this.code,
      message: this.message,
      context: this.context,
    };
  }

  /**
   * Representación en string (para logs en CloudWatch).
   */
  toString() {
    let base = `[${this.code}] ${this.message}`;
    if (Object.keys(this.context).length > 0) {
      base += ` | Context: ${JSON.stringify(this.context)}`;
    }
    return base;
  }

  // -----------------------------------
  // Métodos estáticos para cada tipo de error
  // -----------------------------------

  static FALTA_ID_CLINICA() {
    return new AppError({
      code: "ERR100",
      humanMessage: "Falta el ID de la clínica. Por favor indique la clínica.",
    });
  }

  static NINGUN_TRATAMIENTO_SELECCIONADO() {
    return new AppError({
      code: "ERR101",
      humanMessage: "No ha seleccionado ningún tratamiento. Revise su solicitud.",
    });
  }

  static NINGUNA_FECHA_SELECCIONADA() {
    return new AppError({
      code: "ERR102",
      humanMessage: "No se han seleccionado fechas. Por favor agregue las fechas requeridas.",
    });
  }

  static TRATAMIENTOS_NO_ENCONTRADOS(tratamientos = []) {
    return new AppError({
      code: "ERR200",
      humanMessage: `Los tratamientos indicados no existen en la base de datos: ${tratamientos.join(", ")}. Por favor, revise o cree estos tratamientos.`,
      context: { tratamientos },
    });
  }

  static TRATAMIENTOS_NO_EXACTOS(tratamientos = []) {
    return new AppError({
      code: "ERR201",
      humanMessage: `Ninguno de los tratamientos coincide exactamente: ${tratamientos.join(", ")}. Verifique o cree el tratamiento correctamente.`,
      context: { tratamientos },
    });
  }

  static NINGUN_MEDICO_ENCONTRADO(tratamiento = "") {
    return new AppError({
      code: "ERR202",
      humanMessage: `No hay médicos configurados para el tratamiento "${tratamiento}". Por favor, asigne el tratamiento a un médico.`,
      context: { tratamiento },
    });
  }

  static NINGUN_ESPACIO_ENCONTRADO(tratamiento = "", medicos = []) {
    return new AppError({
      code: "ERR203",
      humanMessage: `No hay espacios disponibles para el tratamiento "${tratamiento}" con los médicos [${medicos.join(", ")}]. Por favor configure espacios para el tratamiento y/o verifique que ese espacio esté habilitado para un médico.`,
      context: { tratamiento, medicos },
    });
  }

  static ERROR_CONSULTA_SQL(errorOriginal) {
    return new AppError({
      code: "ERR204",
      humanMessage: `Ha ocurrido un error interno al consultar la base de datos. Contacte a soporte. Detalle: ${errorOriginal.message}`,
      context: { errorOriginal },
    });
  }

  static NO_PROG_MEDICOS(medicos = [], fechas = []) {
    return new AppError({
      code: "ERR210",
      humanMessage: `No se encontró programación para los médicos [${medicos.join(", ")}] en las fechas [${fechas.join(", ")}]. Por favor registre la programación en esas fechas.`,
      context: { medicos, fechas },
    });
  }

  static NO_PROG_ESPACIOS(espacios = [], fechas = []) {
    return new AppError({
      code: "ERR211",
      humanMessage: `No se encontró programación de espacios para [${espacios.join(", ")}] en las fechas [${fechas.join(", ")}]. Por favor registre la programación en esas fechas.`,
      context: { espacios, fechas },
    });
  }

  static SIN_HORARIOS_DISPONIBLES(tratamiento = "", medicos = [], espacios = []) {
    return new AppError({
      code: "ERR300",
      humanMessage: `No se encontraron horarios disponibles para "${tratamiento}". No hay disponibilidad con esos médicos [${medicos.join(", ")}] y esos espacios [${espacios.join(", ")}].`,
      context: { tratamiento, medicos, espacios },
      isLogOnly: true,
    });
  }

  static ERROR_CALCULO_DISPONIBILIDAD() {
    return new AppError({
      code: "ERR301",
      humanMessage: "Ocurrió un error al calcular la disponibilidad. Contacte a soporte.",
    });
  }

  static CONEXION_BD() {
    return new AppError({
      code: "ERR400",
      humanMessage: "Se ha perdido la conexión a la base de datos. Contacte a soporte.",
    });
  }

  static TIEMPO_ESPERA_BD() {
    return new AppError({
      code: "ERR401",
      humanMessage: "La consulta a la base de datos tardó demasiado. Contacte a soporte.",
    });
  }

  static ERROR_INTERNO_SERVIDOR() {
    return new AppError({
      code: "ERR500",
      humanMessage: "Error interno en el servidor. Por favor, contacte a soporte.",
    });
  }

  static ERROR_DESCONOCIDO(error) {
    return new AppError({
      code: "ERR501",
      humanMessage: `Error desconocido: ${error.message}. Por favor, contacte a soporte.`,
      context: { error },
    });
  }
}

module.exports = AppError;
