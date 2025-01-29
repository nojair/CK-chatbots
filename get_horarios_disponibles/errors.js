const ERRORS = {
  // 📌 Errores de Entrada de Datos (1XX)
  MISSING_CLINIC_ID: { code: "ERR100", message: "Falta el ID de la clínica." },
  NO_TREATMENTS_SELECTED: { code: "ERR101", message: "No se seleccionaron tratamientos." },
  NO_DATES_SELECTED: { code: "ERR102", message: "No se han seleccionado fechas para la consulta." },

  // 📌 Errores de Consulta de Datos (2XX)
  NO_TREATMENTS_FOUND: (tratamientos) => ({
    code: "ERR200",
    message: `Los tratamientos consultados no existen en la base de datos: ${tratamientos.join(", ")}.`
  }),
  NO_EXACT_TREATMENTS: (tratamientos) => ({
    code: "ERR201",
    message: `No se encontraron tratamientos exactos entre los seleccionados: ${tratamientos.join(", ")}.`
  }),
  NO_DOCTORS_FOUND: { code: "ERR202", message: "No se encontraron médicos configurados para atender la consulta." },
  NO_SPACES_FOUND: { code: "ERR203", message: "No se encontraron espacios configurados para atender la consulta." },
  QUERY_ERROR: (error) => ({
    code: "ERR204",
    message: `Error en la consulta SQL: ${error.message}`,
    details: error
  }),

  // 📌 Errores de Disponibilidad (3XX)
  NO_AVAILABLE_SLOTS: { code: "ERR300", message: "No se encontraron horarios disponibles para los tratamientos buscados." },
  AVAILABILITY_CALCULATION_ERROR: { code: "ERR301", message: "Error en el cálculo de disponibilidad." },

  // 📌 Errores de Infraestructura (4XX)
  DATABASE_CONNECTION: { code: "ERR400", message: "Conexión a la base de datos perdida." },
  DATABASE_TIMEOUT: { code: "ERR401", message: "Tiempo de espera agotado al consultar la base de datos." },

  // 📌 Errores Internos del Servidor (5XX)
  INTERNAL_SERVER_ERROR: { code: "ERR500", message: "Error interno del servidor." },
  UNKNOWN_ERROR: (error) => ({
    code: "ERR501",
    message: `Error desconocido: ${error.message}`,
    details: error
  })
};

module.exports = ERRORS;
