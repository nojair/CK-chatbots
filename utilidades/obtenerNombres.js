const { ejecutarConReintento } = require("./ejecutarConReintento");
const AppError = require("./AppError");

async function getNombreClinica(id_clinica) {
  try {
    const resultado = await ejecutarConReintento(
      "SELECT nombre_clinica FROM clinicas WHERE id_clinica = ?",
      [id_clinica]
    );
    if (resultado.length === 0) {
      throw AppError.TRATAMIENTOS_NO_ENCONTRADOS([id_clinica]); // Puedes crear un error específico si la clínica no existe
    }
    return resultado[0].nombre_clinica;
  } catch (error) {
    console.error(`Error al obtener el nombre de la clínica con ID ${id_clinica}:`, error);
    throw AppError.ERROR_CONSULTA_SQL(error);
  }
}

async function getNombreMedico(id_medico) {
  try {
    const resultado = await ejecutarConReintento(
      "SELECT CONCAT(nombre_medico, ' ', apellido_medico) AS nombre_completo FROM medicos WHERE id_medico = ?",
      [id_medico]
    );
    if (resultado.length === 0) {
      return `ID_MEDICO_${id_medico}`;
    }
    return resultado[0].nombre_completo;
  } catch (error) {
    console.error(`Error al obtener el nombre del médico con ID ${id_medico}:`, error);
    throw AppError.ERROR_CONSULTA_SQL(error);
  }
}

async function getNombreEspacio(id_espacio) {
  try {
    const resultado = await ejecutarConReintento(
      "SELECT nombre AS nombre_espacio FROM espacios WHERE id_espacio = ?",
      [id_espacio]
    );
    if (resultado.length === 0) {
      return `ID_ESPACIO_${id_espacio}`;
    }
    return resultado[0].nombre_espacio;
  } catch (error) {
    console.error(`Error al obtener el nombre del espacio con ID ${id_espacio}:`, error);
    throw AppError.ERROR_CONSULTA_SQL(error);
  }
}

module.exports = {
  getNombreClinica,
  getNombreMedico,
  getNombreEspacio,
};
