const { chromium } = require('playwright');
const fs = require('fs-extra');
const path = require('path');
const xml2js = require('xml2js');
const mysql = require('mysql2/promise');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Directorios de salida
const XML_DIR = path.join(__dirname, '../xml');
fs.ensureDirSync(XML_DIR);

/**
 * Parsea el contenido XML de un CFDI y retorna los datos estructurados.
 */
async function parseXMLContent(xmlText) {
  const parser = new xml2js.Parser({ explicitArray: false });
  const result = await parser.parseStringPromise(xmlText);
  
  const comprobante = result['cfdi:Comprobante'];
  if (!comprobante) {
    throw new Error('Formato CFDI inválido: no se encontró cfdi:Comprobante');
  }

  const emisor = comprobante['cfdi:Emisor'] ? comprobante['cfdi:Emisor'].$ : {};
  const receptor = comprobante['cfdi:Receptor'] ? comprobante['cfdi:Receptor'].$ : {};
  
  const complemento = comprobante['cfdi:Complemento'] || {};
  let uuid = '';
  if (complemento['tfd:TimbreFiscalDigital']) {
    uuid = complemento['tfd:TimbreFiscalDigital'].$.UUID;
  } else if (Array.isArray(complemento)) {
    for (const comp of complemento) {
      if (comp['tfd:TimbreFiscalDigital']) {
        uuid = comp['tfd:TimbreFiscalDigital'].$.UUID;
        break;
      }
    }
  }

  const impuestos = comprobante['cfdi:Impuestos'] || {};
  const iva = impuestos.$ ? (impuestos.$.TotalImpuestosTrasladados || 0) : 0;

  // Extraer conceptos
  let listaConceptos = [];
  if (comprobante['cfdi:Conceptos'] && comprobante['cfdi:Conceptos']['cfdi:Concepto']) {
    const conceptos = comprobante['cfdi:Conceptos']['cfdi:Concepto'];
    listaConceptos = Array.isArray(conceptos) ? conceptos : [conceptos];
  }

  return {
    uuid: uuid || '',
    emisor: emisor.Nombre || '',
    rfc_emisor: emisor.Rfc || '',
    receptor: receptor.Nombre || '',
    rfc_receptor: receptor.Rfc || '',
    total: parseFloat(comprobante.$.Total || 0),
    subtotal: parseFloat(comprobante.$.SubTotal || 0),
    iva: parseFloat(iva || 0),
    metodo_pago: comprobante.$.MetodoPago || '',
    forma_pago: comprobante.$.FormaPago || '',
    moneda: comprobante.$.Moneda || '',
    uso_cfdi: receptor.UsoCFDI || '',
    serie: comprobante.$.Serie || '',
    folio: comprobante.$.Folio || '',
    tipo_comprobante: comprobante.$.TipoDeComprobante || 'I',
    fecha_emision: comprobante.$.Fecha || null,
    conceptos: listaConceptos
  };
}

/**
 * Guarda el CFDI parseado y sus conceptos asociados en la base de datos MySQL.
 */
async function saveCFDIToDB(parsed, xmlText, dbConfig) {
  const connection = await mysql.createConnection(dbConfig);
  try {
    // 1. Insertar Factura
    const sqlFactura = `
      INSERT INTO facturas (
        uuid, emisor, receptor, total, subtotal, iva, metodo_pago,
        forma_pago, moneda, fecha_emision, serie, folio, rfc_emisor,
        rfc_receptor, uso_cfdi, tipo_comprobante, xml_text
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE uuid=uuid
    `;

    await connection.execute(sqlFactura, [
      parsed.uuid,
      parsed.emisor,
      parsed.receptor,
      parsed.total,
      parsed.subtotal,
      parsed.iva,
      parsed.metodo_pago,
      parsed.forma_pago,
      parsed.moneda,
      parsed.fecha_emision ? parsed.fecha_emision.replace('T', ' ') : null,
      parsed.serie,
      parsed.folio,
      parsed.rfc_emisor,
      parsed.rfc_receptor,
      parsed.uso_cfdi,
      parsed.tipo_comprobante,
      xmlText
    ]);

    // Obtener ID insertado
    const [rows] = await connection.execute(
      'SELECT id FROM facturas WHERE uuid = ?',
      [parsed.uuid]
    );
    
    if (rows.length > 0) {
      const facturaId = rows[0].id;

      // 2. Insertar Conceptos
      for (const concepto of parsed.conceptos) {
        const c = concepto.$;
        await connection.execute(`
          INSERT INTO conceptos (
            factura_id, clave_sat, descripcion, cantidad, unidad, valor_unitario, importe
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          facturaId,
          c.ClaveProdServ || '',
          c.Descripcion || '',
          parseFloat(c.Cantidad || 0),
          c.ClaveUnidad || '',
          parseFloat(c.ValorUnitario || 0),
          parseFloat(c.Importe || 0)
        ]);
      }
    }
  } catch (err) {
    if (err.code !== 'ER_DUP_ENTRY') {
      console.error(`[Error DB Guardar CFDI ${parsed.uuid}]:`, err.message);
    }
  } finally {
    await connection.end();
  }
}

/**
 * Resuelve el captcha utilizando la API de Gemini Vision (gemini-1.5-flash).
 */
async function solveCaptchaWithGemini(captchaBuffer) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no configurada');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const response = await model.generateContent([
    {
      inlineData: {
        data: captchaBuffer.toString('base64'),
        mimeType: 'image/png'
      }
    },
    'De esta imagen del captcha del SAT, lee los caracteres (letras y números). Devuelve únicamente los caracteres en mayúsculas, sin espacios, sin explicaciones y sin formato. Si no estás seguro, haz tu mejor esfuerzo.'
  ]);

  const text = response.response.text().trim().replace(/\s+/g, '').toUpperCase();
  return text;
}

/**
 * Inicia la sesión SAT en Playwright y toma la captura del captcha.
 * Intenta resolverlo automáticamente si la API de Gemini está configurada.
 */
async function startSATSession(rfc, password, dbSessionId, dbConfig, actionType = 'cfdi') {
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    console.log(`[Session ${dbSessionId}] Iniciando navegador Playwright...`);
    const isHeadless = process.env.PLAYWRIGHT_HEADLESS === 'true';
    
    const browser = await chromium.launch({
      headless: isHeadless,
      slowMo: 100
    });

    const context = await browser.newContext({
      acceptDownloads: true
    });

    const page = await context.newPage();

    let startUrl = 'https://portalcfdi.facturaelectronica.sat.gob.mx/';
    if (actionType === 'constancia') {
      startUrl = 'https://wwwmat.sat.gob.mx/operacion/43824/reimprime-tus-acuses-del-rfc';
    } else if (actionType === 'opinion') {
      startUrl = 'https://sise.sat.gob.mx/OpinionObligaciones/private/inicio.jsf';
    }

    console.log(`[Session ${dbSessionId}] Navegando al Portal SAT (${actionType})...`);
    await page.goto(startUrl, {
      timeout: 60000,
      waitUntil: 'load'
    });

    // Esperar a que el selector del rfc esté cargado
    await page.waitForSelector('#rfc', { timeout: 30000 });
    
    // Rellenar credenciales
    await page.fill('#rfc', rfc);
    await page.fill('#password', password);

    let autoSolved = false;
    let attempts = 0;
    const maxAttempts = 3;

    if (process.env.GEMINI_API_KEY) {
      console.log(`[Session ${dbSessionId}] Iniciando resolución automática de captcha con Gemini...`);
      await connection.execute(
        "UPDATE sat_sessions SET status = 'iniciando_sesion', error_message = NULL WHERE id = ?",
        [dbSessionId]
      );

      // Buscar elemento captcha
      console.log(`[Session ${dbSessionId}] Buscando elemento captcha...`);
      const captchaImg = page.locator('img[src^="data:image"]');
      await captchaImg.waitFor({ state: 'visible', timeout: 15000 });

      while (attempts < maxAttempts && !autoSolved) {
        attempts++;
        console.log(`[Session ${dbSessionId}] Intento de captcha con Gemini ${attempts}/${maxAttempts}...`);

        const captchaBuffer = await captchaImg.screenshot();
        
        try {
          const solvedText = await solveCaptchaWithGemini(captchaBuffer);
          console.log(`[Session ${dbSessionId}] Gemini interpretó el captcha como: ${solvedText}`);
          
          await page.fill('#userCaptcha', solvedText);
          await page.click('#submit', { noWaitAfter: true });
          
          console.log(`[Session ${dbSessionId}] Esperando respuesta del login del SAT...`);
          
          // Race para determinar éxito o fracaso
          const resultado = await Promise.race([
            page.waitForSelector('text=Captcha no válido', { timeout: 15000 }).then(() => 'captcha_incorrecto'),
            page.waitForSelector('text=RFC o contraseña', { timeout: 15000 }).then(() => 'credenciales_incorrectas'),
            page.waitForSelector('text=incorrectos', { timeout: 15000 }).then(() => 'credenciales_incorrectas'),
            page.waitForSelector('text=Servicios de Factura', { timeout: 20000 }).then(() => 'login_ok')
          ]).catch(async (err) => {
            const content = await page.content();
            if (content.includes('Servicios de Factura')) return 'login_ok';
            if (content.includes('Captcha no válido')) return 'captcha_incorrecto';
            if (content.includes('incorrectos') || content.includes('no válido') || content.includes('no válidos') || content.includes('incorrecta')) return 'credenciales_incorrectas';
            
            // Guardar captura de pantalla de diagnóstico
            try {
              const diagPath = path.join(__dirname, `sat_login_timeout_${dbSessionId}_${Date.now()}.png`);
              await page.screenshot({ path: diagPath });
              console.log(`[Session ${dbSessionId}] Captura de diagnóstico de timeout guardada en: ${diagPath}`);
            } catch (ssErr) {}
            
            throw new Error(`Timeout o inestabilidad del SAT. Detalle: ${err.message}`);
          });

          if (resultado === 'login_ok') {
            autoSolved = true;
            console.log(`[Session ${dbSessionId}] ¡Login SAT completado con éxito mediante Gemini!`);
            break;
          }

          if (resultado === 'credenciales_incorrectas') {
            console.log(`[Session ${dbSessionId}] Credenciales SAT incorrectas.`);
            await connection.execute(`
              UPDATE sat_sessions 
              SET status = 'error', error_message = 'RFC o Contraseña SAT incorrectos.'
              WHERE id = ?
            `, [dbSessionId]);
            await page.close();
            await context.close();
            await browser.close();
            throw new Error('Credenciales inválidas');
          }

          if (resultado === 'captcha_incorrecto') {
            console.log(`[Session ${dbSessionId}] Captcha incorrecto detectado por el SAT.`);
            if (attempts < maxAttempts) {
              await page.waitForTimeout(5000);
              // Recargar credenciales si es necesario
              const rfcActual = await page.inputValue('#rfc');
              if (rfcActual.trim() === '') {
                await page.fill('#rfc', rfc);
                await page.fill('#password', password);
              }
            }
          }
        } catch (geminiError) {
          console.error(`[Session ${dbSessionId}] Error en intento ${attempts} con Gemini:`, geminiError.message);
          if (geminiError.message === 'Credenciales inválidas') {
            throw geminiError;
          }
          if (attempts < maxAttempts) {
            await page.waitForTimeout(5000);
          }
        }
      }
    }

    if (autoSolved) {
      await connection.execute(
        "UPDATE sat_sessions SET status = 'iniciado', error_message = NULL WHERE id = ?",
        [dbSessionId]
      );
      return { browser, context, page, rfc, password, autoSolved: true };
    }

    // --- FALLBACK MANUAL ---
    console.log(`[Session ${dbSessionId}] Cambiando a resolución de captcha manual (Fallback)...`);

    // Obtener Captcha Image
    const captchaImg = page.locator('img[src^="data:image"]');
    await captchaImg.waitFor({ state: 'visible', timeout: 15000 });
    
    const captchaBuffer = await captchaImg.screenshot();
    const captchaBase64 = captchaBuffer.toString('base64');

    // Actualizar Base de Datos con Captcha e indicar estatus
    await connection.execute(`
      UPDATE sat_sessions 
      SET status = 'esperando_captcha', captcha_base64 = ?, error_message = NULL
      WHERE id = ?
    `, [captchaBase64, dbSessionId]);

    console.log(`[Session ${dbSessionId}] Captcha listo y guardado en DB.`);

    return { browser, context, page, rfc, password, autoSolved: false };

  } catch (error) {
    console.error(`[Session ${dbSessionId}] Error al iniciar sesión SAT:`, error.message);
    
    let userFriendlyError = `Error al conectar al SAT: ${error.message}`;
    const errText = error.message.toLowerCase();
    
    if (errText.includes('err_connection_timed_out') || 
        errText.includes('timeout') || 
        errText.includes('net::err') || 
        errText.includes('connection refused') ||
        errText.includes('navigation failed') ||
        errText.includes('aborted')) {
      userFriendlyError = 'El portal del SAT está caído o saturado en este momento. Por favor, intente más tarde.';
    }
    
    await connection.execute(`
      UPDATE sat_sessions 
      SET status = 'error', error_message = ?
      WHERE id = ?
    `, [userFriendlyError, dbSessionId]);
    
    throw error;
  } finally {
    await connection.end();
  }
}

/**
 * Resuelve el Captcha y realiza el login en el SAT.
 */
async function solveCaptchaAndLogin(session, captchaCode, dbSessionId, dbConfig) {
  const connection = await mysql.createConnection(dbConfig);
  const { page, context, rfc, password } = session;

  try {
    console.log(`[Session ${dbSessionId}] Enviando Captcha: ${captchaCode.toUpperCase()}`);
    
    // Llenar el captcha
    await page.fill('#userCaptcha', captchaCode.toUpperCase());
    
    // Clic en Enviar
    await connection.execute(
      "UPDATE sat_sessions SET status = 'iniciando_sesion', error_message = NULL WHERE id = ?",
      [dbSessionId]
    );

    // Intentar clickear el botón Enviar (#submit)
    await page.click('#submit', { noWaitAfter: true });

    console.log(`[Session ${dbSessionId}] Esperando respuesta del login del SAT...`);

    // Race para determinar éxito o fracaso
    const resultado = await Promise.race([
      page.waitForSelector('text=Captcha no válido', { timeout: 15000 }).then(() => 'captcha_incorrecto'),
      page.waitForSelector('text=RFC o contraseña', { timeout: 15000 }).then(() => 'credenciales_incorrectas'),
      page.waitForSelector('text=incorrectos', { timeout: 15000 }).then(() => 'credenciales_incorrectas'),
      page.waitForSelector('text=Servicios de Factura', { timeout: 20000 }).then(() => 'login_ok')
    ]).catch(async (err) => {
      // Si hay timeout pero el selector de "Servicios de Factura" o "Captcha no válido" no se gatilló,
      // validamos manualmente el estado actual del dom o si redireccionó.
      const content = await page.content();
      if (content.includes('Servicios de Factura')) {
        return 'login_ok';
      }
      if (content.includes('Captcha no válido')) {
        return 'captcha_incorrecto';
      }
      if (content.includes('incorrectos') || content.includes('no válido') || content.includes('no válidos') || content.includes('incorrecta')) {
        return 'credenciales_incorrectas';
      }
      
      // Guardar captura de pantalla de diagnóstico
      try {
        const diagPath = path.join(__dirname, `sat_login_timeout_manual_${dbSessionId}_${Date.now()}.png`);
        await page.screenshot({ path: diagPath });
        console.log(`[Session ${dbSessionId}] Captura de diagnóstico de timeout manual guardada en: ${diagPath}`);
      } catch (ssErr) {}
      
      throw new Error(`Timeout o inestabilidad del SAT. Detalle: ${err.message}`);
    });

    if (resultado === 'captcha_incorrecto') {
      console.log(`[Session ${dbSessionId}] Captcha incorrecto detectado.`);
      
      // Esperar regeneración del captcha
      await page.waitForTimeout(5000);
      
      // Recargar credenciales si es necesario
      const rfcActual = await page.inputValue('#rfc');
      if (rfcActual.trim() === '') {
        await page.fill('#rfc', rfc);
        await page.fill('#password', password);
      }

      // Tomar nueva captura de captcha
      const captchaImg = page.locator('img[src^="data:image"]');
      await captchaImg.waitFor({ state: 'visible', timeout: 10000 });
      const captchaBuffer = await captchaImg.screenshot();
      const captchaBase64 = captchaBuffer.toString('base64');

      await connection.execute(`
        UPDATE sat_sessions 
        SET status = 'esperando_captcha', captcha_base64 = ?, error_message = 'Captcha incorrecto. Intenta de nuevo.'
        WHERE id = ?
      `, [captchaBase64, dbSessionId]);

      return { success: false, error: 'Captcha incorrecto' };
    }

    if (resultado === 'credenciales_incorrectas') {
      console.log(`[Session ${dbSessionId}] RFC o Contraseña incorrectos.`);
      
      await connection.execute(`
        UPDATE sat_sessions 
        SET status = 'error', error_message = 'RFC o Contraseña SAT incorrectos.'
        WHERE id = ?
      `, [dbSessionId]);

      await page.close();
      await context.close();
      
      return { success: false, error: 'Credenciales inválidas' };
    }

    console.log(`[Session ${dbSessionId}] Login SAT Completado con éxito!`);
    await connection.execute(
      "UPDATE sat_sessions SET status = 'iniciado', error_message = NULL WHERE id = ?",
      [dbSessionId]
    );

    return { success: true };

  } catch (error) {
    console.error(`[Session ${dbSessionId}] Error durante login:`, error.message);
    
    // Re-capturar captcha por si se recargó la página o quedó trabado
    let captchaBase64 = null;
    try {
      const captchaImg = page.locator('img[src^="data:image"]');
      if (await captchaImg.count() > 0) {
        const captchaBuffer = await captchaImg.screenshot();
        captchaBase64 = captchaBuffer.toString('base64');
      }
    } catch (e) {}

    await connection.execute(`
      UPDATE sat_sessions 
      SET status = 'esperando_captcha', captcha_base64 = ?, error_message = ?
      WHERE id = ?
    `, [captchaBase64, `Error: ${error.message}. Captcha regenerado.`, dbSessionId]);

    return { success: false, error: error.message };
  } finally {
    await connection.end();
  }
}

/**
 * Realiza la descarga masiva en segundo plano, parseando e insertando en la DB.
 */
async function downloadCFDIs(session, dbSessionId, dbConfig, fechaInicio) {
  const connection = await mysql.createConnection(dbConfig);
  const { page, context } = session;

  try {
    console.log(`[Session ${dbSessionId}] Navegando a Consultar Facturas Recibidas...`);
    
    await page.evaluate(() => {
      const links = document.querySelectorAll('a');
      for (const link of links) {
        if (link.innerText.includes('Consultar Facturas Recibidas')) {
          link.click();
          break;
        }
      }
    });

    console.log(`[Session ${dbSessionId}] Esperando a que cargue el formulario de búsqueda...`);
    await page.waitForSelector('#ctl00_MainContent_RdoFechas', { timeout: 30000 });
    
    // Activar búsqueda por fechas
    await page.click('#ctl00_MainContent_RdoFechas');
    await page.waitForTimeout(3000); // Esperar carga de selects

    // Procesar fechaInicio para rellenar los combos
    const dateObj = new Date(fechaInicio + 'T12:00:00'); // Evitar desajuste de zona horaria
    const y = dateObj.getFullYear().toString();
    const m = (dateObj.getMonth() + 1).toString();
    const d = dateObj.getDate().toString();

    console.log(`[Session ${dbSessionId}] Seleccionando Fecha: ${y}-${m}-${d}`);
    await page.selectOption('#DdlAnio', y);
    await page.waitForTimeout(1000);
    await page.selectOption('#ctl00_MainContent_CldFecha_DdlMes', m);
    await page.waitForTimeout(1000);
    await page.selectOption('#ctl00_MainContent_CldFecha_DdlDia', d);
    await page.waitForTimeout(2000);

    // Clic en Buscar
    console.log(`[Session ${dbSessionId}] Ejecutando Búsqueda...`);
    await page.click('#ctl00_MainContent_BtnBusqueda');
    
    await connection.execute(
      "UPDATE sat_sessions SET status = 'buscando', error_message = NULL WHERE id = ?",
      [dbSessionId]
    );

    // Esperar resultados
    await page.waitForTimeout(10000);

    // Contar filas
    const filas = await page.locator('tr').all();
    console.log(`[Session ${dbSessionId}] Filas encontradas: ${filas.length}`);

    // Filtrar filas con botón de descarga de XML (nube)
    const filasValidas = [];
    for (const fila of filas) {
      const botonXML = fila.locator('span.glyphicon-cloud-download');
      if (await botonXML.count() > 0) {
        filasValidas.push(botonXML);
      }
    }

    const totalXml = filasValidas.length;
    console.log(`[Session ${dbSessionId}] XMLs detectados para descargar: ${totalXml}`);

    await connection.execute(`
      UPDATE sat_sessions 
      SET status = 'descargando', total_xml = ?, xml_descargados = 0, progreso = 0
      WHERE id = ?
    `, [totalXml, dbSessionId]);

    if (totalXml === 0) {
      console.log(`[Session ${dbSessionId}] No hay facturas para descargar en esta fecha.`);
      await connection.execute(
        "UPDATE sat_sessions SET status = 'completado', progreso = 100 WHERE id = ?",
        [dbSessionId]
      );
      return;
    }

    let contador = 0;
    for (const botonXML of filasValidas) {
      try {
        contador++;
        console.log(`[Session ${dbSessionId}] Descargando XML ${contador}/${totalXml}...`);

        // Enfocar elemento
        await botonXML.first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);

        // Disparar y esperar descarga
        const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
        await botonXML.first().click({ force: true });
        const download = await downloadPromise;

        // Nombre de archivo temporal
        const tempName = `temp_${dbSessionId}_${Date.now()}.xml`;
        const tempPath = path.join(XML_DIR, tempName);

        // Guardar archivo temporal
        await download.saveAs(tempPath);

        // Parsea el XML
        const xmlContent = await fs.readFile(tempPath, 'utf8');
        const parsed = await parseXMLContent(xmlContent);

        if (parsed.uuid) {
          // Guardar con su nombre UUID real
          const finalPath = path.join(XML_DIR, `${parsed.uuid}.xml`);
          await fs.rename(tempPath, finalPath);

          // Guardar en la base de datos MySQL
          await saveCFDIToDB(parsed, xmlContent, dbConfig);
          console.log(`[Session ${dbSessionId}] XML ${parsed.uuid} guardado en BD.`);
        } else {
          // Borrar si no tiene UUID (inválido)
          await fs.remove(tempPath);
        }

        // Cerrar popups/tabs extras
        const paginas = context.pages();
        for (const p of paginas) {
          if (p !== page) {
            try { await p.close(); } catch (e) {}
          }
        }
        await page.bringToFront();

        // Actualizar progreso
        const pct = Math.round((contador / totalXml) * 100);
        await connection.execute(`
          UPDATE sat_sessions 
          SET xml_descargados = ?, progreso = ?
          WHERE id = ?
        `, [contador, pct, dbSessionId]);

        // Intervalo de espera humana
        await page.waitForTimeout(4000);

      } catch (rowErr) {
        console.error(`[Session ${dbSessionId}] Error descargando fila ${contador}:`, rowErr.message);
        
        // Cerrar popups fallidos
        const paginas = context.pages();
        for (const p of paginas) {
          if (p !== page) {
            try { await p.close(); } catch (e) {}
          }
        }
        await page.bringToFront();
      }
    }

    console.log(`[Session ${dbSessionId}] Descarga masiva finalizada con éxito!`);
    await connection.execute(
      "UPDATE sat_sessions SET status = 'completado', progreso = 100 WHERE id = ?",
      [dbSessionId]
    );

  } catch (error) {
    console.error(`[Session ${dbSessionId}] Error en proceso de descarga:`, error.message);
    
    let userFriendlyError = `Error en descarga: ${error.message}`;
    const errText = error.message.toLowerCase();
    
    if (errText.includes('err_connection_timed_out') || 
        errText.includes('timeout') || 
        errText.includes('net::err') || 
        errText.includes('connection refused') ||
        errText.includes('navigation failed') ||
        errText.includes('aborted')) {
      userFriendlyError = 'El portal del SAT está caído o saturado en este momento. Por favor, intente más tarde.';
    }

    await connection.execute(`
      UPDATE sat_sessions 
      SET status = 'error', error_message = ?
      WHERE id = ?
    `, [userFriendlyError, dbSessionId]);
  } finally {
    await connection.end();
    
    // Cerrar el navegador al finalizar
    try {
      await page.close();
      await context.close();
      await session.browser.close();
    } catch (e) {}
  }
}

/**
 * Realiza la descarga de la Constancia de Situación Fiscal.
 */
async function downloadConstancia(session, dbSessionId, dbConfig, contribuyenteId) {
  const connection = await mysql.createConnection(dbConfig);
  const { page, context, rfc } = session;

  try {
    console.log(`[Session ${dbSessionId}] Navegando a Generar Constancia de Situación Fiscal...`);
    
    await connection.execute(
      "UPDATE sat_sessions SET status = 'descargando', error_message = NULL WHERE id = ?",
      [dbSessionId]
    );

    // Ir a la URL directa de acuses del SIAT (nuevo portal)
    await page.goto('https://wwwmat.sat.gob.mx/operacion/43824/reimprime-tus-acuses-del-rfc', {
      timeout: 60000,
      waitUntil: 'load'
    });

    // Esperar a que el botón "Generar Constancia" sea visible
    console.log(`[Session ${dbSessionId}] Esperando a que el botón Generar Constancia esté visible...`);
    const btnConstancia = page.locator('input[value*="Generar Constancia"], button:has-text("Generar Constancia")');
    await btnConstancia.waitFor({ state: 'visible', timeout: 30000 });

    // Disparar y esperar evento de descarga o popup
    console.log(`[Session ${dbSessionId}] Haciendo clic en Generar Constancia...`);
    
    let download = null;
    let popupPage = null;

    try {
      const result = await Promise.race([
        page.waitForEvent('download', { timeout: 30000 }).then(d => ({ type: 'download', data: d })),
        context.waitForEvent('page', { timeout: 30000 }).then(p => ({ type: 'popup', data: p }))
      ]);

      if (result.type === 'download') {
        download = result.data;
      } else {
        popupPage = result.data;
      }
    } catch (e) {
      console.log(`[Session ${dbSessionId}] No se detectó evento inmediato de descarga o popup. Buscando pestañas...`);
    }

    // Nombre de archivo final
    const fileName = `constancia_${rfc}_${Date.now()}.pdf`;
    const destFolder = path.join(__dirname, 'public/downloads/documentos');
    fs.ensureDirSync(destFolder);
    const destPath = path.join(destFolder, fileName);

    if (download) {
      // Guardar archivo
      await download.saveAs(destPath);
      console.log(`[Session ${dbSessionId}] Constancia guardada exitosamente en: ${destPath}`);
    } else {
      // Intentar buscar ventana emergente
      if (!popupPage) {
        await page.waitForTimeout(5000);
        const paginas = context.pages();
        for (const p of paginas) {
          if (p !== page && (p.url().includes('.pdf') || p.url().includes('reimprime') || p.url().includes('Acuses'))) {
            popupPage = p;
            break;
          }
        }
      }

      if (popupPage) {
        console.log(`[Session ${dbSessionId}] Encontrada pestaña de Constancia. Guardando PDF...`);
        await popupPage.waitForLoadState('load');
        const response = await popupPage.goto(popupPage.url());
        const pdfBuffer = await response.body();
        await fs.writeFile(destPath, pdfBuffer);
        console.log(`[Session ${dbSessionId}] Constancia guardada exitosamente desde pestaña en: ${destPath}`);
      } else {
        throw new Error('No se pudo interceptar la descarga ni la ventana emergente de la Constancia.');
      }
    }

    // Registrar en base de datos
    await connection.execute(`
      INSERT INTO documentos_sat (contribuyente_id, tipo_documento, file_name)
      VALUES (?, 'constancia', ?)
    `, [contribuyenteId, fileName]);

    console.log(`[Session ${dbSessionId}] Registro de Constancia guardado en base de datos.`);

    await connection.execute(
      "UPDATE sat_sessions SET status = 'completado', progreso = 100 WHERE id = ?",
      [dbSessionId]
    );

  } catch (error) {
    try {
      const diagPath = path.join(__dirname, `sat_constancia_error_${dbSessionId}_${Date.now()}.png`);
      await page.screenshot({ path: diagPath });
      console.log(`[Session ${dbSessionId}] Captura de error de constancia guardada en: ${diagPath}`);
    } catch (ssErr) {}
    console.error(`[Session ${dbSessionId}] Error al descargar Constancia:`, error.message);
    
    let userFriendlyError = `Error al generar Constancia: ${error.message}`;
    const errText = error.message.toLowerCase();
    if (errText.includes('err_connection_timed_out') || 
        errText.includes('timeout') || 
        errText.includes('net::err') || 
        errText.includes('connection refused') ||
        errText.includes('navigation failed') ||
        errText.includes('aborted')) {
      userFriendlyError = 'El portal del SAT está caído o saturado en este momento. Por favor, intente más tarde.';
    }

    await connection.execute(`
      UPDATE sat_sessions 
      SET status = 'error', error_message = ?
      WHERE id = ?
    `, [userFriendlyError, dbSessionId]);
    throw error;
  } finally {
    await connection.end();
    
    // Cerrar el navegador al finalizar
    try {
      await page.close();
      await context.close();
      await session.browser.close();
    } catch (e) {}
  }
}

/**
 * Realiza la descarga de la Opinión de Cumplimiento de Obligaciones Fiscales.
 */
async function downloadOpinion(session, dbSessionId, dbConfig, contribuyenteId) {
  const connection = await mysql.createConnection(dbConfig);
  const { page, context, rfc } = session;

  try {
    console.log(`[Session ${dbSessionId}] Navegando a Obtener Opinión de Cumplimiento...`);
    
    await connection.execute(
      "UPDATE sat_sessions SET status = 'descargando', error_message = NULL WHERE id = ?",
      [dbSessionId]
    );

    // Ir a la URL directa del SISE de opinión
    const downloadPromise = page.waitForEvent('download', { timeout: 45000 }).catch(() => null);

    await page.goto('https://sise.sat.gob.mx/OpinionObligaciones/private/inicio.jsf', {
      timeout: 60000,
      waitUntil: 'load'
    });

    console.log(`[Session ${dbSessionId}] Esperando a que el SAT genere la opinión (PDF)...`);
    
    // Esperar descarga automática
    let download = await downloadPromise;

    if (!download) {
      console.log(`[Session ${dbSessionId}] Buscando botón de descarga manual de la opinión en la página...`);
      await page.waitForTimeout(5000);
      
      const btnDescargar = page.locator('input[value*="Descargar"], button:has-text("Descargar"), a:has-text("Guardar"), button:has-text("Imprimir"), input[value*="Imprimir"]');
      if (await btnDescargar.count() > 0) {
        console.log(`[Session ${dbSessionId}] Botón encontrado, haciendo clic para descargar...`);
        const manualDownloadPromise = page.waitForEvent('download', { timeout: 30000 });
        await btnDescargar.first().click();
        download = await manualDownloadPromise;
      }
    }

    if (!download) {
      // Verificar ventana emergente
      const paginas = context.pages();
      for (const p of paginas) {
        if (p !== page && p.url().includes('.pdf')) {
          console.log(`[Session ${dbSessionId}] Encontrada pestaña de PDF de la opinión, guardando...`);
          const response = await p.goto(p.url());
          const pdfBuffer = await response.body();
          const fileName = `opinion_${rfc}_${Date.now()}.pdf`;
          const destPath = path.join(__dirname, 'public/downloads/documentos', fileName);
          await fs.writeFile(destPath, pdfBuffer);
          
          await connection.execute(`
            INSERT INTO documentos_sat (contribuyente_id, tipo_documento, file_name)
            VALUES (?, 'opinion', ?)
          `, [contribuyenteId, fileName]);
          
          console.log(`[Session ${dbSessionId}] Opinión guardada desde pestaña en: ${destPath}`);
          
          await connection.execute(
            "UPDATE sat_sessions SET status = 'completado', progreso = 100 WHERE id = ?",
            [dbSessionId]
          );
          return;
        }
      }
      throw new Error('No se detectó la descarga del PDF de la Opinión de Cumplimiento.');
    }

    // Nombre de archivo final
    const fileName = `opinion_${rfc}_${Date.now()}.pdf`;
    const destFolder = path.join(__dirname, 'public/downloads/documentos');
    fs.ensureDirSync(destFolder);
    const destPath = path.join(destFolder, fileName);

    // Guardar archivo
    await download.saveAs(destPath);
    console.log(`[Session ${dbSessionId}] Opinión guardada exitosamente en: ${destPath}`);

    // Registrar en base de datos
    await connection.execute(`
      INSERT INTO documentos_sat (contribuyente_id, tipo_documento, file_name)
      VALUES (?, 'opinion', ?)
    `, [contribuyenteId, fileName]);

    console.log(`[Session ${dbSessionId}] Registro de Opinión guardado en base de datos.`);

    await connection.execute(
      "UPDATE sat_sessions SET status = 'completado', progreso = 100 WHERE id = ?",
      [dbSessionId]
    );

  } catch (error) {
    try {
      const diagPath = path.join(__dirname, `sat_opinion_error_${dbSessionId}_${Date.now()}.png`);
      await page.screenshot({ path: diagPath });
      console.log(`[Session ${dbSessionId}] Captura de error de opinión guardada en: ${diagPath}`);
    } catch (ssErr) {}
    console.error(`[Session ${dbSessionId}] Error al descargar Opinión:`, error.message);
    
    let userFriendlyError = `Error al generar Opinión: ${error.message}`;
    const errText = error.message.toLowerCase();
    if (errText.includes('err_connection_timed_out') || 
        errText.includes('timeout') || 
        errText.includes('net::err') || 
        errText.includes('connection refused') ||
        errText.includes('navigation failed') ||
        errText.includes('aborted')) {
      userFriendlyError = 'El portal del SAT está caído o saturado en este momento. Por favor, intente más tarde.';
    }

    await connection.execute(`
      UPDATE sat_sessions 
      SET status = 'error', error_message = ?
      WHERE id = ?
    `, [userFriendlyError, dbSessionId]);
    throw error;
  } finally {
    await connection.end();
    
    // Cerrar el navegador al finalizar
    try {
      await page.close();
      await context.close();
      await session.browser.close();
    } catch (e) {}
  }
}

module.exports = {
  startSATSession,
  solveCaptchaAndLogin,
  downloadCFDIs,
  downloadConstancia,
  downloadOpinion
};
