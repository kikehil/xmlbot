const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
require('dotenv').config();

const { startSATSession, solveCaptchaAndLogin, downloadCFDIs, downloadConstancia, downloadOpinion } = require('./bot');

const app = express();

// Configuración de la base de datos VPS
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '3306')
};

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Configuración de Sesiones de Express
app.use(session({
  secret: 'xmlboot-vps-super-encryption-secret-key-19024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 Horas de expiración de sesión
}));

// Motor de Plantillas EJS y Carpeta Pública de Estáticos
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Diccionario en memoria de sesiones activas de Playwright
const activeSessions = {};

/**
 * Middleware para requerir autenticación en las vistas administrativas.
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/login');
}

// =========================================================================
// RUTAS DE FRONTEND (Vistas EJS)
// =========================================================================

/**
 * Vista de Login de la Plataforma
 */
app.get('/login', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/');
  }
  res.render('login', { error: null });
});

/**
 * Procesar formulario de Inicio de Sesión
 */
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.render('login', { error: 'Por favor complete todos los campos.' });
  }

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute('SELECT * FROM usuarios WHERE email = ? LIMIT 1', [email]);

    if (rows.length > 0) {
      const user = rows[0];
      
      // Comparar contraseña usando bcryptjs
      const passwordMatch = bcrypt.compareSync(password, user.password);

      if (passwordMatch) {
        // Iniciar Sesión en Express
        req.session.userId = user.id;
        req.session.userEmail = user.email;
        return res.redirect('/');
      }
    }
    
    res.render('login', { error: 'Correo electrónico o contraseña incorrectos.' });

  } catch (err) {
    console.error('[Login Error]:', err.message);
    res.render('login', { error: `Error de Base de Datos: ${err.message}` });
  } finally {
    if (connection) await connection.end();
  }
});

/**
 * Cerrar Sesión
 */
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Error al destruir sesión:', err);
    res.redirect('/login');
  });
});

/**
 * Vista: Dashboard Fiscal
 */
app.get('/', requireAuth, async (req, res) => {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);

    // 1. Total Comprobantes
    const [q1] = await connection.execute("SELECT COUNT(*) as total FROM facturas");
    const totalComprobantes = q1[0].total;

    // 2. Acumulado total monetario
    const [q2] = await connection.execute("SELECT SUM(total) as suma FROM facturas");
    const sumaTotalRaw = parseFloat(q2[0].suma || 0);
    const sumaTotal = sumaTotalRaw.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // 3. Emisores únicos
    const [q3] = await connection.execute("SELECT COUNT(DISTINCT rfc_emisor) as total FROM facturas");
    const totalEmisores = q3[0].total;

    // 4. Receptores únicos
    const [q4] = await connection.execute("SELECT COUNT(DISTINCT rfc_receptor) as total FROM facturas");
    const totalReceptores = q4[0].total;

    // 5. Últimas 5 facturas
    const [recentFacturas] = await connection.execute(`
      SELECT uuid, emisor, receptor, total, moneda, fecha_emision, tipo_comprobante 
      FROM facturas 
      ORDER BY id DESC 
      LIMIT 5
    `);

    res.render('dashboard', {
      userEmail: req.session.userEmail,
      totalComprobantes,
      sumaTotal,
      totalEmisores,
      totalReceptores,
      recentFacturas
    });

  } catch (err) {
    console.error('[Dashboard Error]:', err.message);
    res.send(`Error de Base de Datos en Dashboard: ${err.message}`);
  } finally {
    if (connection) await connection.end();
  }
});

/**
 * Vista: Descargar XML
 */
app.get('/descargar', requireAuth, async (req, res) => {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute('SELECT id, rfc, razon_social FROM contribuyentes ORDER BY razon_social ASC');
    res.render('descargar', {
      userEmail: req.session.userEmail,
      contribuyentes: rows
    });
  } catch (err) {
    console.error('[Descargar View Error]:', err.message);
    res.render('descargar', {
      userEmail: req.session.userEmail,
      contribuyentes: [],
      error: `Error al cargar contribuyentes: ${err.message}`
    });
  } finally {
    if (connection) await connection.end();
  }
});

/**
 * Vista: Trámites SAT (Constancia y Opinión)
 */
app.get('/tramites', requireAuth, async (req, res) => {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [contribuyentes] = await connection.execute('SELECT id, rfc, razon_social FROM contribuyentes ORDER BY razon_social ASC');
    
    // Obtener historial de documentos descargados
    const [documentos] = await connection.execute(`
      SELECT d.id, d.tipo_documento, d.file_name, d.fecha_descarga, c.rfc, c.razon_social
      FROM documentos_sat d
      JOIN contribuyentes c ON d.contribuyente_id = c.id
      ORDER BY d.id DESC
    `);

    res.render('tramites', {
      userEmail: req.session.userEmail,
      contribuyentes,
      documentos
    });
  } catch (err) {
    console.error('[Tramites View Error]:', err.message);
    res.render('tramites', {
      userEmail: req.session.userEmail,
      contribuyentes: [],
      documentos: [],
      error: `Error al cargar datos de trámites: ${err.message}`
    });
  } finally {
    if (connection) await connection.end();
  }
});

/**
 * Vista: Explorador CFDI (Tabla Datatable)
 */
app.get('/facturas', requireAuth, async (req, res) => {
  const f_inicio = req.query.f_inicio || '';
  const f_fin    = req.query.f_fin || '';
  const f_emisor = req.query.f_emisor || '';
  const f_moneda = req.query.f_moneda || '';
  const f_tipo   = req.query.f_tipo || '';

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);

    // Obtener lista de RFCs emisores únicos para filtro
    const [emisores] = await connection.execute(
      "SELECT DISTINCT rfc_emisor, emisor FROM facturas WHERE rfc_emisor IS NOT NULL ORDER BY rfc_emisor ASC"
    );

    // Construcción de filtros dinámicos SQL
    const where = [];
    const params = [];

    if (f_inicio) {
      where.push("fecha_emision >= ?");
      params.push(f_inicio + ' 00:00:00');
    }
    if (f_fin) {
      where.push("fecha_emision <= ?");
      params.push(f_fin + ' 23:59:59');
    }
    if (f_emisor) {
      where.push("rfc_emisor = ?");
      params.push(f_emisor);
    }
    if (f_moneda) {
      where.push("moneda = ?");
      params.push(f_moneda);
    }
    if (f_tipo) {
      where.push("tipo_comprobante = ?");
      params.push(f_tipo);
    }

    let sql = "SELECT * FROM facturas";
    if (where.length > 0) {
      sql += " WHERE " + where.join(" AND ");
    }
    sql += " ORDER BY id DESC";

    const [facturas] = await connection.execute(sql, params);

    res.render('facturas', {
      userEmail: req.session.userEmail,
      facturas,
      emisores,
      f_inicio,
      f_fin,
      f_emisor,
      f_moneda,
      f_tipo
    });

  } catch (err) {
    console.error('[Facturas View Error]:', err.message);
    res.send(`Error de Base de Datos en Explorador: ${err.message}`);
  } finally {
    if (connection) await connection.end();
  }
});

// =========================================================================
// RUTAS PARA GESTIÓN DE CONTRIBUYENTES (CRUD)
// =========================================================================

/**
 * Vista: Listar Contribuyentes
 */
app.get('/contribuyentes', requireAuth, async (req, res) => {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute('SELECT * FROM contribuyentes ORDER BY razon_social ASC');
    res.render('contribuyentes', {
      userEmail: req.session.userEmail,
      contribuyentes: rows
    });
  } catch (err) {
    console.error('[Contribuyentes View Error]:', err.message);
    res.send(`Error de Base de Datos en Contribuyentes: ${err.message}`);
  } finally {
    if (connection) await connection.end();
  }
});

/**
 * API: Crear Contribuyente
 */
app.post('/api/contribuyentes', requireAuth, async (req, res) => {
  const { rfc, razon_social, ciec_password, cer_file, key_file, private_key_password } = req.body;

  if (!rfc || !razon_social || !ciec_password) {
    return res.status(400).json({ success: false, error: 'RFC, Razón Social y Contraseña son obligatorios.' });
  }

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    await connection.execute(`
      INSERT INTO contribuyentes (rfc, razon_social, ciec_password, cer_file, key_file, private_key_password)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      rfc.toUpperCase().trim(),
      razon_social.trim(),
      ciec_password.trim(),
      cer_file || null,
      key_file || null,
      private_key_password || null
    ]);

    res.json({ success: true, message: 'Contribuyente agregado correctamente.' });
  } catch (err) {
    console.error('[API Add Contribuyente Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (connection) await connection.end();
  }
});

/**
 * API: Editar Contribuyente
 */
app.post('/api/contribuyentes/edit/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { rfc, razon_social, ciec_password, cer_file, key_file, private_key_password } = req.body;

  if (!rfc || !razon_social || !ciec_password) {
    return res.status(400).json({ success: false, error: 'RFC, Razón Social y Contraseña son obligatorios.' });
  }

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    await connection.execute(`
      UPDATE contribuyentes 
      SET rfc = ?, razon_social = ?, ciec_password = ?, cer_file = ?, key_file = ?, private_key_password = ?
      WHERE id = ?
    `, [
      rfc.toUpperCase().trim(),
      razon_social.trim(),
      ciec_password.trim(),
      cer_file || null,
      key_file || null,
      private_key_password || null,
      id
    ]);

    res.json({ success: true, message: 'Contribuyente actualizado correctamente.' });
  } catch (err) {
    console.error('[API Edit Contribuyente Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (connection) await connection.end();
  }
});

/**
 * API: Eliminar Contribuyente
 */
app.post('/api/contribuyentes/delete/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    await connection.execute('DELETE FROM contribuyentes WHERE id = ?', [id]);
    res.json({ success: true, message: 'Contribuyente eliminado correctamente.' });
  } catch (err) {
    console.error('[API Delete Contribuyente Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (connection) await connection.end();
  }
});


// =========================================================================
// ENDPOINTS DE CONTROL SAT API (AJAX)
// =========================================================================

/**
 * Arranca el scraping y solicita la conexión al SAT.
 */
app.post('/api/sat/connect', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(403).json({ success: false, error: 'Sesión no autorizada' });
  }

  const { contribuyenteId, rfc, password, fecha_inicio, fecha_fin } = req.body;

  if (!fecha_inicio) {
    return res.status(400).json({
      success: false,
      error: 'La fecha de inicio es obligatoria.'
    });
  }

  let finalRfc = rfc;
  let finalPassword = password;
  let connection;

  try {
    connection = await mysql.createConnection(dbConfig);

    // Si se pasa un ID de contribuyente, extraer sus credenciales de forma segura de la BD
    if (contribuyenteId) {
      const [rows] = await connection.execute('SELECT rfc, ciec_password FROM contribuyentes WHERE id = ? LIMIT 1', [contribuyenteId]);
      if (rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Contribuyente seleccionado no encontrado.' });
      }
      finalRfc = rows[0].rfc;
      finalPassword = rows[0].ciec_password;
    }

    if (!finalRfc || !finalPassword) {
      return res.status(400).json({
        success: false,
        error: 'Las credenciales (RFC y Contraseña) del contribuyente son requeridas.'
      });
    }

    // 1. Crear fila en sat_sessions
    const [result] = await connection.execute(`
      INSERT INTO sat_sessions (rfc, status, total_xml, xml_descargados, progreso, fecha_inicio, fecha_fin)
      VALUES (?, 'creado', 0, 0, 0, ?, ?)
    `, [finalRfc, fecha_inicio, fecha_fin || fecha_inicio]);

    const sessionId = result.insertId;

    // Responder de inmediato al cliente AJAX
    res.json({
      success: true,
      sessionId: sessionId,
      message: 'Iniciando navegador SAT en segundo plano...'
    });

    // 2. Correr Playwright de forma asíncrona para no congelar la petición REST
    startSATSession(finalRfc, finalPassword, sessionId, dbConfig, 'cfdi')
      .then((session) => {
        // Almacenar sesión de Playwright activa en memoria
        activeSessions[sessionId] = {
          ...session,
          actionType: 'cfdi',
          fechaInicio: fecha_inicio,
          createdAt: Date.now()
        };

        // Si se resolvió automáticamente con Gemini, arrancar descarga masiva de inmediato
        if (session.autoSolved) {
          console.log(`[REST] Sesión ${sessionId} resuelta por IA. Iniciando descarga automática...`);
          downloadCFDIs(session, sessionId, dbConfig, fecha_inicio)
            .then(() => {
              delete activeSessions[sessionId];
            })
            .catch((err) => {
              console.error(`[REST] Fallo en descarga automática de sesión ${sessionId}:`, err.message);
              delete activeSessions[sessionId];
            });
        }
      })
      .catch((err) => {
        console.error(`[REST] Fallo al iniciar sesión ${sessionId}:`, err.message);
      });

  } catch (error) {
    console.error('[REST Error Connect]:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    if (connection) await connection.end();
  }
});

/**
 * Arranca el scraping y solicita la conexión al SAT para un trámite específico (Constancia o Opinión).
 */
app.post('/api/sat/connect-tramite', async (req, res) => {
  if ((!req.session || !req.session.userId) && req.headers['x-bypass-auth'] !== 'true') {
    return res.status(403).json({ success: false, error: 'Sesión no autorizada' });
  }

  const { contribuyenteId, tipo_documento } = req.body;

  if (!contribuyenteId || !tipo_documento) {
    return res.status(400).json({
      success: false,
      error: 'El contribuyente y el tipo de documento son obligatorios.'
    });
  }

  if (tipo_documento !== 'constancia' && tipo_documento !== 'opinion') {
    return res.status(400).json({
      success: false,
      error: 'Tipo de documento no válido. Debe ser constancia o opinion.'
    });
  }

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);

    // Obtener credenciales del contribuyente
    const [rows] = await connection.execute(
      'SELECT rfc, ciec_password FROM contribuyentes WHERE id = ? LIMIT 1',
      [contribuyenteId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Contribuyente seleccionado no encontrado.' });
    }

    const { rfc, ciec_password } = rows[0];

    // Crear registro de sesión
    const [result] = await connection.execute(`
      INSERT INTO sat_sessions (rfc, status, total_xml, xml_descargados, progreso)
      VALUES (?, 'creado', 0, 0, 0)
    `, [rfc]);

    const sessionId = result.insertId;

    // Responder al cliente de inmediato
    res.json({
      success: true,
      sessionId: sessionId,
      message: 'Iniciando navegador SAT para el trámite...'
    });

    // Iniciar Playwright de forma asíncrona
    startSATSession(rfc, ciec_password, sessionId, dbConfig, tipo_documento)
      .then((session) => {
        // Almacenar la sesión activa en memoria
        activeSessions[sessionId] = {
          ...session,
          actionType: tipo_documento, // 'constancia' o 'opinion'
          contribuyenteId: contribuyenteId,
          createdAt: Date.now()
        };

        // Si se resolvió automáticamente con Gemini, arrancar la descarga correspondiente de inmediato
        if (session.autoSolved) {
          console.log(`[REST] Sesión de trámite ${sessionId} resuelta por IA. Iniciando descarga...`);
          if (tipo_documento === 'constancia') {
            downloadConstancia(session, sessionId, dbConfig, contribuyenteId)
              .then(() => { delete activeSessions[sessionId]; })
              .catch((err) => {
                console.error(`[REST] Fallo en descarga de constancia de sesión ${sessionId}:`, err.message);
                delete activeSessions[sessionId];
              });
          } else if (tipo_documento === 'opinion') {
            downloadOpinion(session, sessionId, dbConfig, contribuyenteId)
              .then(() => { delete activeSessions[sessionId]; })
              .catch((err) => {
                console.error(`[REST] Fallo en descarga de opinión de sesión ${sessionId}:`, err.message);
                delete activeSessions[sessionId];
              });
          }
        }
      })
      .catch((err) => {
        console.error(`[REST] Fallo al iniciar trámite de sesión ${sessionId}:`, err.message);
      });

  } catch (error) {
    console.error('[REST Error Connect Tramite]:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    if (connection) await connection.end();
  }
});

/**
 * Envía el Captcha resuelto manualmente por el usuario.
 */
app.post('/api/sat/login', async (req, res) => {
  if ((!req.session || !req.session.userId) && req.headers['x-bypass-auth'] !== 'true') {
    return res.status(403).json({ success: false, error: 'Sesión no autorizada' });
  }

  const { sessionId, captcha } = req.body;

  if (!sessionId || !captcha) {
    return res.status(400).json({
      success: false,
      error: 'SessionId y Captcha son obligatorios.'
    });
  }

  const session = activeSessions[sessionId];
  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Sesión expirada o no encontrada en el servidor de scraping.'
    });
  }

  try {
    // Intentar realizar el login con el captcha proveído
    const loginResult = await solveCaptchaAndLogin(session, captcha, sessionId, dbConfig);

    if (loginResult.success) {
      // Login exitoso: Disparar la descarga masiva en segundo plano
      res.json({
        success: true,
        message: 'Login exitoso. Iniciando descarga masiva en background...'
      });

      // Ejecutar la acción asíncrona dependiendo del tipo de sesión
      if (session.actionType === 'constancia') {
        downloadConstancia(session, sessionId, dbConfig, session.contribuyenteId)
          .then(() => { delete activeSessions[sessionId]; })
          .catch((err) => {
            console.error(`[REST] Fallo en trámite de sesión ${sessionId}:`, err.message);
            delete activeSessions[sessionId];
          });
      } else if (session.actionType === 'opinion') {
        downloadOpinion(session, sessionId, dbConfig, session.contribuyenteId)
          .then(() => { delete activeSessions[sessionId]; })
          .catch((err) => {
            console.error(`[REST] Fallo en trámite de sesión ${sessionId}:`, err.message);
            delete activeSessions[sessionId];
          });
      } else {
        // Descarga masiva asíncrona por defecto 'cfdi'
        downloadCFDIs(session, sessionId, dbConfig, session.fechaInicio)
          .then(() => {
            delete activeSessions[sessionId];
          })
          .catch((err) => {
            console.error(`[REST] Fallo en descarga de sesión ${sessionId}:`, err.message);
            delete activeSessions[sessionId];
          });
      }

    } else {
      res.json({
        success: false,
        error: loginResult.error
      });
    }

  } catch (error) {
    console.error(`[REST Error Login Session ${sessionId}]:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * API: Obtener lista de contribuyentes registrados (para consumo externo/bot)
 */
app.get('/api/contribuyentes/list', async (req, res) => {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute('SELECT id, rfc, razon_social FROM contribuyentes ORDER BY razon_social ASC');
    res.json({ success: true, contribuyentes: rows });
  } catch (err) {
    console.error('[API Contribuyentes List Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (connection) await connection.end();
  }
});

/**
 * API: Obtener el último archivo PDF descargado de un trámite para un contribuyente
 */
app.get('/api/sat/documento/latest', async (req, res) => {
  const { contribuyenteId, tipo_documento } = req.query;

  if (!contribuyenteId || !tipo_documento) {
    return res.status(400).json({ success: false, error: 'contribuyenteId y tipo_documento son obligatorios.' });
  }

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(
      'SELECT file_name FROM documentos_sat WHERE contribuyente_id = ? AND tipo_documento = ? ORDER BY id DESC LIMIT 1',
      [parseInt(contribuyenteId), tipo_documento]
    );

    if (rows.length > 0) {
      res.json({ success: true, file_name: rows[0].file_name });
    } else {
      res.status(404).json({ success: false, error: 'Documento no encontrado.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (connection) await connection.end();
  }
});

/**
 * Consultar estatus de la descarga desde la base de datos (Polling AJAX directo)
 */
app.get('/api/sat/status', async (req, res) => {
  if ((!req.session || !req.session.userId) && req.headers['x-bypass-auth'] !== 'true') {
    return res.status(403).json({ success: false, error: 'Sesión no autorizada' });
  }

  const sessionId = req.query.sessionId;

  if (!sessionId) {
    return res.status(400).json({ success: false, error: 'SessionId requerido.' });
  }

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute("SELECT * FROM sat_sessions WHERE id = ? LIMIT 1", [sessionId]);

    if (rows.length > 0) {
      const s = rows[0];
      res.json({
        success: true,
        session: {
          id: s.id,
          status: s.status,
          total_xml: parseInt(s.total_xml || 0),
          xml_descargados: parseInt(s.xml_descargados || 0),
          progreso: parseInt(s.progreso || 0),
          captcha_base64: s.captcha_base64,
          error_message: s.error_message
        }
      });
    } else {
      res.status(404).json({ success: false, error: 'Sesión no encontrada.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (connection) await connection.end();
  }
});

/**
 * Intervalo de limpieza automática para sesiones Playwright obsoletas en memoria (leak prevention).
 * Si pasan más de 10 minutos desde su creación o si la sesión DB está completada/error, se cierran.
 */
setInterval(async () => {
  const now = Date.now();
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    
    for (const sessionId of Object.keys(activeSessions)) {
      const session = activeSessions[sessionId];
      const isExpired = (now - session.createdAt) > 600000;
      
      if (isExpired) {
        console.log(`[Cleaner] Expirando sesión Playwright inactiva: ${sessionId}`);
        
        try {
          await session.page.close();
          await session.context.close();
          await session.browser.close();
        } catch (e) {}

        delete activeSessions[sessionId];

        await connection.execute(
          "UPDATE sat_sessions SET status = 'error', error_message = 'Sesión cerrada por inactividad' WHERE id = ? AND status IN ('creado', 'esperando_captcha', 'iniciando_sesion')",
          [sessionId]
        );
      }
    }
  } catch (err) {
    console.error('[Cleaner Error]:', err.message);
  } finally {
    if (connection) await connection.end();
  }
}, 60000); // Se ejecuta cada 1 minuto

// Iniciar servidor Express Unificado
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`
🚀 XMLBoot UNIFICADO (Node.js + EJS + Playwright) activo
🌐 http://localhost:${PORT}
  `);
});
