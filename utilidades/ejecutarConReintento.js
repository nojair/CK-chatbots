const { obtenerPoolBD } = require("../base_de_datos/conexionBD");
const AppError = require("./AppError");

async function ejecutarConReintento(consulta, parametros = [], reintentos = 3) {
  const poolBD = obtenerPoolBD();

  for (let intento = 1; intento <= reintentos; intento++) {
    let conexion;
    try {
      conexion = await poolBD.getConnection();
      const [rows] = await conexion.execute(consulta, parametros);
      return rows;
    } catch (error) {
      console.error(`Intento ${intento} falló:`, error);

      if (intento === reintentos || error.code !== "ER_CLIENT_INTERACTION_TIMEOUT") {
        throw AppError.ERROR_CONSULTA_SQL(error);
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    } finally {
      if (conexion) conexion.release();
    }
  }

  throw AppError.ERROR_CONSULTA_SQL(new Error("Fallo inesperado en reintentos"));
}

module.exports = {
  ejecutarConReintento,
};
