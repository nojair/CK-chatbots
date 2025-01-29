// src/utilidades/errores.js
const ERRORES = {
  // 📌 Errores de Entrada de Datos (1XX)
  FALTA_ID_CLINICA: {
    code: "ERR100",
    message: "Falta el ID de la clínica.",
  },
  NINGUN_TRATAMIENTO_SELECCIONADO: {
    code: "ERR101",
    message: "No se seleccionaron tratamientos.",
  },
  NINGUNA_FECHA_SELECCIONADA: {
    code: "ERR102",
    message: "No se han seleccionado fechas para la consulta.",
  },

  // 📌 Errores de Consulta de Datos (2XX)
  TRATAMIENTOS_NO_ENCONTRADOS: (tratamientos) => ({
    code: "ERR200",
    message: `Los tratamientos consultados no existen en la base de datos: ${tratamientos.join(", ")}.`,
  }),
  TRATAMIENTOS_NO_EXACTOS: (tratamientos) => ({
    code: "ERR201",
    message: `No se encontraron tratamientos exactos entre los seleccionados: ${tratamientos.join(", ")}.`,
  }),
  NINGUN_MEDICO_ENCONTRADO: {
    code: "ERR202",
    message: "No se encontraron médicos configurados para atender la consulta.",
  },
  NINGUN_ESPACIO_ENCONTRADO: {
    code: "ERR203",
    message: "No se encontraron espacios configurados para atender la consulta.",
  },
  ERROR_CONSULTA_SQL: (error) => ({
    code: "ERR204",
    message: `Error en la consulta SQL: ${error.message}`,
    details: error,
  }),
  NO_PROG_MEDICOS: {
    code: "ERR210",
    message: "No se encontró programación para los médicos.",
  },
  NO_PROG_ESPACIOS: {
    code: "ERR211",
    message: "No se encontró programación para los espacios.",
  },

  // 📌 Errores de Disponibilidad (3XX)
  SIN_HORARIOS_DISPONIBLES: {
    code: "ERR300",
    message: "No se encontraron horarios disponibles para los tratamientos buscados.",
  },
  ERROR_CALCULO_DISPONIBILIDAD: {
    code: "ERR301",
    message: "Error en el cálculo de disponibilidad.",
  },

  // 📌 Errores de Infraestructura (4XX)
  CONEXION_BD: {
    code: "ERR400",
    message: "Conexión a la base de datos perdida.",
  },
  TIEMPO_ESPERA_BD: {
    code: "ERR401",
    message: "Tiempo de espera agotado al consultar la base de datos.",
  },

  // 📌 Errores Internos del Servidor (5XX)
  ERROR_INTERNO_SERVIDOR: {
    code: "ERR500",
    message: "Error interno del servidor.",
  },
  ERROR_DESCONOCIDO: (error) => ({
    code: "ERR501",
    message: `Error desconocido: ${error.message}`,
    details: error,
  }),
};

module.exports = ERRORES;
