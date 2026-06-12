const mysql = require('mysql2/promise');
require('dotenv').config();

async function test() {

  try {

    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT
    });

    console.log('✅ Conexión exitosa al VPS MySQL');

    await connection.end();

  } catch (error) {

    console.error('❌ Error:', error.message);

  }

}

test();