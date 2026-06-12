const mysql = require('mysql2/promise');
require('dotenv').config();

async function guardarFactura() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT
    });

    const uuid = '123456-ABC';
    const emisor = 'CADENA COMERCIAL OXXO';
    const receptor = 'ENRIQUE GIL ZARATE';
    const total = 150.75;

    const sql = `
      INSERT INTO facturas
      (uuid, emisor, receptor, total)
      VALUES (?, ?, ?, ?)
    `;

    await connection.execute(sql, [
      uuid,
      emisor,
      receptor,
      total
    ]);

    console.log('✅ Factura guardada correctamente');

    await connection.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

guardarFactura();