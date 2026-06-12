const fs = require('fs-extra');
const xml2js = require('xml2js');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function procesarXML() {
  try {

    // Leer XML
    const xml = await fs.readFile('./xmls/factura.xml', 'utf8');

    // Convertir XML a JSON
    const parser = new xml2js.Parser({
      explicitArray: false
    });

    const result = await parser.parseStringPromise(xml);

    // CFDI
    const comprobante = result['cfdi:Comprobante'];

    // Emisor
    const emisor = comprobante['cfdi:Emisor'].$;

    // Receptor
    const receptor = comprobante['cfdi:Receptor'].$;

    // Timbre Fiscal
    const complemento = comprobante['cfdi:Complemento'];
    const timbre = complemento['tfd:TimbreFiscalDigital'].$;

    // Datos
    const uuid = timbre.UUID;
    const nombreEmisor = emisor.Nombre;
    const nombreReceptor = receptor.Nombre;
    const total = comprobante.$.Total;

    // Conexión MySQL
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT
    });

    // Insertar
    const sql = `
      INSERT INTO facturas
      (uuid, emisor, receptor, total, xml_text)
      VALUES (?, ?, ?, ?, ?)
    `;

    await connection.execute(sql, [
      uuid,
      nombreEmisor,
      nombreReceptor,
      total,
      xml
    ]);

    console.log('✅ XML guardado correctamente');

    await connection.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

procesarXML();