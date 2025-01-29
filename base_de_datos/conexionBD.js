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
      // acquireTimeout: 10000,
      idleTimeout: 30000,
      queueLimit: 0,
    });
  }
  return poolBD;
}

module.exports = {
  obtenerPoolBD,
};
