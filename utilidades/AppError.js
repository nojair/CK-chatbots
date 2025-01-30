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
      humanMessage: "Falta el ID de la clínica en la solicitud. Por favor avisar al equipo de desarrollo.",
    });
  }

  static CLINICA_NO_ENCONTRADA(id_clinica) {
    return new AppError({
      code: "ERR202",
      humanMessage: `No se encontró la clínica con ID ${id_clinica}. Por favor, verifique la información o contacte al soporte.`,
      context: { id_clinica },
    });
  }  

  static NINGUN_TRATAMIENTO_SELECCIONADO() {
    return new AppError({
      code: "ERR101",
      humanMessage: "No se ha detectado ningún tratamiento en la solicitud. Por favor avisar al quipo de desarrollo",
    });
  }

  static NINGUNA_FECHA_SELECCIONADA() {
    return new AppError({
      code: "ERR102",
      humanMessage: "No se ha detectado ninguna fecha en la solicitud. Por favor avisar al quipo de desarrollo",
    });
  }

  static TRATAMIENTOS_NO_ENCONTRADOS(tratamientos = []) {
    return new AppError({
      code: "ERR200",
      humanMessage: `Los tratamientos en la solicitud no existen en la base de datos: ${tratamientos.join(", ")}. Por favor, revise si existe o cree los tratamientos.`,
      context: { tratamientos },
    });
  }

  static TRATAMIENTOS_NO_EXACTOS(tratamientos = []) {
    return new AppError({
      code: "ERR201",
      humanMessage: `Ninguno de los tratamientos proporcionados coincide exactamente en la base de datos: ${tratamientos.join(", ")}. Por favor, revise o ajuste los nombres de los tratamientos.`,
      context: { tratamientos },
    });
  }  

  static NINGUN_MEDICO_ENCONTRADO(tratamientos = []) {
    const tratamientosStr = tratamientos.join(", ");

    return new AppError({
      code: "ERR202",
      humanMessage: `No hay médicos configurados para el tratamiento "${tratamientosStr}". Por favor, asigne el tratamiento a un médico.`,
      context: { tratamientos },
    });
  }

  static NINGUN_ESPACIO_ENCONTRADO(tratamientos = [], medicos = []) {
    const tratamientosStr = tratamientos.join(", ");

    return new AppError({
      code: "ERR203",
      humanMessage: `No hay espacios disponibles para el tratamiento "${tratamientosStr}" con los médicos [${medicos.join(", ")}]. Por favor configure espacios para el tratamiento y/o verifique que ese espacio esté habilitado para un médico.`,
      context: { tratamientos, medicos },
    });
  }

  static ERROR_CONSULTA_SQL(errorOriginal) {
    return new AppError({
      code: "ERR204",
      humanMessage: `Ha ocurrido un error interno al consultar la base de datos. Por favor avisar al equipo de desarrollo. Detalle: ${errorOriginal.message}`,
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

  static SIN_HORARIOS_DISPONIBLES(tratamientos = [], fechas = []) {
    const tratamientosStr = tratamientos.join(", ");

    const fechasFormateadas = fechas.map(fechaObj => {
      const fechaDate = new Date(fechaObj.fecha);
      const dia = String(fechaDate.getDate()).padStart(2, "0");
      const mes = String(fechaDate.getMonth() + 1).padStart(2, "0");
      const anio = fechaDate.getFullYear();
      let fechaStr = `${dia}/${mes}/${anio}`;

      const horasPresentes = fechaObj.horas.filter(horaObj => horaObj.hora_inicio || horaObj.hora_fin);

      const horasStr = horasPresentes.map(horaObj => {
        const { hora_inicio, hora_fin } = horaObj;
        if (hora_inicio && hora_fin) {
          return `entre las ${hora_inicio} y las ${hora_fin}`;
        } else if (hora_inicio) {
          return `a partir de las ${hora_inicio}`;
        } else if (hora_fin) {
          return `hasta las ${hora_fin}`;
        } else {
          return "";
        }
      }).filter(s => s !== "").join(", ");

      if (horasStr) {
        return `${fechaStr} ${horasStr}`;
      } else {
        return `${fechaStr}`;
      }
    });

    const fechasStr = fechasFormateadas.join(", ");

    const humanMessage = `No se encontraron horarios disponibles para los tratamientos [${tratamientosStr}] en las siguientes fechas: ${fechasStr}.`;

    return new AppError({
      code: "ERR300",
      humanMessage,
      context: { tratamientos, fechas },
      isLogOnly: true,
    });
  }

  static ERROR_CALCULO_DISPONIBILIDAD() {
    return new AppError({
      code: "ERR301",
      humanMessage: "Ocurrió un error al calcular la disponibilidad. Por favor avisar al equipo de desarrollo.",
    });
  }

  static CONEXION_BD() {
    return new AppError({
      code: "ERR400",
      humanMessage: "Se ha perdido la conexión a la base de datos. Por favor avisar al equipo de desarrollo.",
    });
  }

  static TIEMPO_ESPERA_BD() {
    return new AppError({
      code: "ERR401",
      humanMessage: "La consulta a la base de datos tardó demasiado. Por favor avisar al equipo de desarrollo.",
    });
  }

  static ERROR_INTERNO_SERVIDOR() {
    return new AppError({
      code: "ERR500",
      humanMessage: "Error interno en el servidor. Por favor avisar al equipo de desarrollo.",
    });
  }

  static ERROR_DESCONOCIDO(error) {
    return new AppError({
      code: "ERR501",
      humanMessage: `Error desconocido: ${error.message}. Por favor avisar al equipo de desarrollo.`,
      context: { error },
    });
  }
}

module.exports = AppError;
