const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const path = require('path');
const multer = require('multer');
const fs = require('fs-extra');
const xml2js = require('xml2js');

require('dotenv').config();

const app = express();

const upload = multer({
  dest: 'uploads/'
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============================
// CONEXIÓN MYSQL
// ============================

async function getConnection() {

  return await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
  });

}

// ============================
// RUTA PRINCIPAL
// ============================

app.get('/', (req, res) => {

  res.json({
    ok: true,
    proyecto: 'CFDIBOOT API'
  });

});

// ============================
// API FACTURAS
// ============================

app.get('/facturas', async (req, res) => {

  try {

    const connection = await getConnection();

    const [rows] = await connection.execute(`
      SELECT
        id,
        uuid,
        emisor,
        receptor,
        total,
        created_at
      FROM facturas
      ORDER BY id DESC
    `);

    await connection.end();

    res.json(rows);

  } catch (error) {

    console.log(error);

    res.status(500).json({
      ok: false,
      error: error.message
    });

  }

});

// ============================
// DASHBOARD
// ============================


app.get('/dashboard', async (req, res) => {

  try {

    const connection = await getConnection();

    const [facturas] = await connection.execute(`
      SELECT
        f.*,
        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'clave_sat', c.clave_sat,
              'descripcion', c.descripcion,
              'cantidad', c.cantidad,
              'unidad', c.unidad,
              'valor_unitario', c.valor_unitario,
              'importe', c.importe
            )
          )
          FROM conceptos c
          WHERE c.factura_id = f.id
        ) AS conceptos
      FROM facturas f
      ORDER BY f.id DESC
    `);

   

    res.render('index', {
      facturas
    });

  } catch (error) {

    console.error(error);

    res.send('Error dashboard');

  }

});


// ============================
// SUBIR XML
// ============================

app.post('/upload-xml', upload.single('xml'), async (req, res) => {

  try {

    const xmlContent = await fs.readFile(req.file.path);

    const parser = new xml2js.Parser({
      explicitArray: false
    });

    const result = await parser.parseStringPromise(xmlContent);

    const comprobante = result['cfdi:Comprobante'];

    const emisor = comprobante['cfdi:Emisor'];

    const receptor = comprobante['cfdi:Receptor'];

    const complemento = comprobante['cfdi:Complemento'];

    const timbre = complemento['tfd:TimbreFiscalDigital'];

const uuid = timbre.$.UUID;

const total = comprobante.$.Total;

const subtotal = comprobante.$.SubTotal || 0;

const fechaEmision = comprobante.$.Fecha || null;

const metodoPago = comprobante.$.MetodoPago || '';

const formaPago = comprobante.$.FormaPago || '';

const moneda = comprobante.$.Moneda || '';

const serie = comprobante.$.Serie || '';

const folio = comprobante.$.Folio || '';

const rfcEmisor = emisor.$.Rfc || '';

const rfcReceptor = receptor.$.Rfc || '';

const usoCFDI = receptor.$.UsoCFDI || '';

const impuestos = comprobante['cfdi:Impuestos'];

const iva = impuestos?.$.TotalImpuestosTrasladados || 0;

    const connection = await getConnection();

    await connection.execute(`
  INSERT INTO facturas (
    uuid,
    emisor,
    receptor,
    total,
    subtotal,
    iva,
    metodo_pago,
    forma_pago,
    moneda,
    fecha_emision,
    serie,
    folio,
    rfc_emisor,
    rfc_receptor,
    uso_cfdi
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`, [
  uuid,
  emisor.$.Nombre,
  receptor.$.Nombre,
  total,
  subtotal,
  iva,
  metodoPago,
  formaPago,
  moneda,
  fechaEmision,
  serie,
  folio,
  rfcEmisor,
  rfcReceptor,
  usoCFDI
]);

const [facturaInsertada] = await connection.execute(`
  SELECT id
  FROM facturas
  WHERE uuid = ?
`, [uuid]);

const facturaId = facturaInsertada[0].id;

// =======================
// CONCEPTOS
// =======================

const conceptos = comprobante['cfdi:Conceptos']['cfdi:Concepto'];

const listaConceptos = Array.isArray(conceptos)
  ? conceptos
  : [conceptos];

for (const concepto of listaConceptos) {

  await connection.execute(`
    INSERT INTO conceptos (
      factura_id,
      clave_sat,
      descripcion,
      cantidad,
      unidad,
      valor_unitario,
      importe
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    facturaId,
    concepto.$.ClaveProdServ || '',
    concepto.$.Descripcion || '',
    concepto.$.Cantidad || 0,
    concepto.$.ClaveUnidad || '',
    concepto.$.ValorUnitario || 0,
    concepto.$.Importe || 0
  ]);

}
    await connection.end();

    await fs.remove(req.file.path);

    return res.json({
      ok: true,
      mensaje: 'XML procesado correctamente 🚀'
    });

  } catch (error) {

    console.log(error);

    if (error.code === 'ER_DUP_ENTRY') {

      return res.status(400).json({
        ok: false,
        error: 'Este XML ya fue procesado anteriormente ⚠️'
      });

    }

    return res.status(500).json({
      ok: false,
      error: error.message
    });

  }

});

// ============================
// PUERTO
// ============================

const PORT = process.env.PORT || 3007;

app.listen(PORT, () => {

  console.log(`
🚀 CFDIBOOT API
🌐 http://localhost:${PORT}
  `);

});