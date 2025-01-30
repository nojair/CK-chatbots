const { obtenerPoolBD } = require("../base_de_datos/conexionBD");
const ERRORES = require("./errores");

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

      // Si es el último intento o no es un timeout "ER_CLIENT_INTERACTION_TIMEOUT", lanzamos error
      if (intento === reintentos || error.code !== "ER_CLIENT_INTERACTION_TIMEOUT") {
        throw ERRORES.ERROR_CONSULTA_SQL(error);
      }

      // Esperamos 1 segundo antes de reintentar
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } finally {
      if (conexion) conexion.release();
    }
  }
}

module.exports = {
  ejecutarConReintento,
};
