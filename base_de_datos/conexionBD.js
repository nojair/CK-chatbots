const mysql = require("mysql2/promise");
require("dotenv").config();

const {
  MYSQL_DB,
  MYSQL_HOST,
  MYSQL_USER,
  MYSQL_PASSWORD,
} = process.env;

let poolBD;

function obtenerPoolBD() {
  if (!poolBD) {
    console.log("[DEBUG] Inicializando el pool de conexiones MySQL");

    poolBD = mysql.createPool({
      timezone: "Z",
      connectionLimit: 20,
      waitForConnections: true,
      host: MYSQL_HOST,
      user: MYSQL_USER,
      database: MYSQL_DB,
      password: MYSQL_PASSWORD,
      connectTimeout: 10000,
      idleTimeout: 30000,
      queueLimit: 0,
    });

    poolBD.on("connection", async (connection) => {
      console.log("[DEBUG] Nueva conexión establecida con MySQL");
      try {
        await connection.query("SET SESSION wait_timeout=28800");
        await connection.query("SET SESSION interactive_timeout=28800");
      } catch (err) {
        console.error("[ERROR] No fue posible configurar los timeouts de la sesión:", err);
      }
    });    

    poolBD.on("error", (err) => {
      console.error("[ERROR] Problema en el pool de conexiones:", err);
      poolBD = null;
    });
  }

  return poolBD;
}

module.exports = { obtenerPoolBD };
