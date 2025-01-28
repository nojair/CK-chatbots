// db.js
const mysql = require("mysql2/promise");
require("dotenv").config();

const MYSQL_DB = process.env.MYSQL_DB;
const MYSQL_HOST = process.env.MYSQL_HOST;
const MYSQL_USER = process.env.MYSQL_USER;
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD;

let pool;

function getDbPool() {
  if (!pool) {
    console.log("[DEBUG] Initializing MySQL pool");
    pool = mysql.createPool({
      timezone: 'Z',
      connectionLimit: 20,        // Aumentar el límite de conexiones si es necesario
      waitForConnections: true,
      host: MYSQL_HOST,
      user: MYSQL_USER,
      database: MYSQL_DB,
      password: MYSQL_PASSWORD,
      connectTimeout: 10000,      // 10 segundos para establecer una conexión
      acquireTimeout: 10000,      // 10 segundos para adquirir una conexión del pool
      idleTimeout: 30000,         // 30 segundos antes de cerrar una conexión inactiva
      queueLimit: 0,               // Sin límite en la cola
    });
  }
  return pool;
}

module.exports = {
  getDbPool,
};
