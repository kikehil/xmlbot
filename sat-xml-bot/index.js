const { chromium } = require('playwright');
const fs = require('fs');
const xml2js = require('xml2js');

(async () => {

    // =========================
    // CONFIG
    // =========================

    const RFC = 'GIZE850118H6A';
    const PASSWORD = 'kajaker1';

    // =========================
    // NAVEGADOR
    // =========================

    const browser = await chromium.launch({

        headless: false,
        slowMo: 300

    });

    const context = await browser.newContext({

        acceptDownloads: true

    });

    const page = await context.newPage();

    // =========================
    // ABRIR SAT
    // =========================

    await page.goto(
        'https://portalcfdi.facturaelectronica.sat.gob.mx/'
    );

    // =========================
    // LOGIN
    // =========================

    await page.waitForSelector('#rfc');

    await page.fill('#rfc', RFC);

    await page.fill('#password', PASSWORD);

    console.log(
        'Completa captcha y presiona ENVIAR'
    );

    let loginExitoso = false;

    while (!loginExitoso) {

        console.log(
            'Esperando respuesta SAT...'
        );

        const resultado = await Promise.race([

            page.waitForSelector(
                'text=Captcha no válido',
                {
                    timeout: 0
                }
            ).then(() => 'captcha'),

            page.waitForSelector(
                'text=Servicios de Factura',
                {
                    timeout: 0
                }
            ).then(() => 'ok')

        ]);

        // =========================
        // LOGIN OK
        // =========================

        if (resultado === 'ok') {

            loginExitoso = true;

            console.log(
                'Login exitoso'
            );

            break;
        }

        // =========================
        // CAPTCHA INCORRECTO
        // =========================

        console.log(
            'Captcha incorrecto'
        );

        // Esperar regeneración
        await page.waitForTimeout(5000);

        // Verificar si SAT borró RFC
        const existeRFC =
            await page.locator('#rfc').count();

        if (existeRFC > 0) {

            const rfcActual =
                await page.inputValue('#rfc');

            if (rfcActual.trim() === '') {

                console.log(
                    'SAT borró credenciales'
                );

                await page.fill('#rfc', RFC);

                await page.fill(
                    '#password',
                    PASSWORD
                );

            }

        }

        // Focus captcha
        const existeCaptcha =
            await page.locator(
                '#userCaptcha'
            ).count();

        if (existeCaptcha > 0) {

            await page.click(
                '#userCaptcha'
            );

        }

        console.log(
            'Nuevo captcha listo'
        );

        console.log(
            'Completa captcha y presiona ENVIAR'
        );

    }

    // =========================
    // FACTURAS RECIBIDAS
    // =========================

    console.log(
        'Entrando a Facturas Recibidas...'
    );

    await page.evaluate(() => {

        const links =
            document.querySelectorAll('a');

        for (const link of links) {

            if (
                link.innerText.includes(
                    'Consultar Facturas Recibidas'
                )
            ) {

                link.click();

                break;
            }
        }

    });

    // =========================
    // ESPERAR PANTALLA
    // =========================

    await page.waitForSelector(
        '#ctl00_MainContent_RdoFechas',
        {
            timeout: 60000
        }
    );

    console.log(
        'Pantalla CFDI cargada'
    );

    // =========================
    // FILTRO FECHA
    // =========================

    await page.click(
        '#ctl00_MainContent_RdoFechas'
    );

    console.log(
        'Filtro fecha activado'
    );

    await page.waitForTimeout(5000);

    // =========================
    // FECHA
    // =========================

    await page.selectOption(
        '#DdlAnio',
        '2025'
    );

    await page.selectOption(
        '#ctl00_MainContent_CldFecha_DdlMes',
        '1'
    );

    await page.selectOption(
        '#ctl00_MainContent_CldFecha_DdlDia',
        '1'
    );

    console.log(
        'Fecha seleccionada'
    );

    await page.waitForTimeout(3000);

    // =========================
    // BUSCAR CFDI
    // =========================

    await page.click(
        '#ctl00_MainContent_BtnBusqueda'
    );

    console.log(
        'Buscando CFDI...'
    );

    await page.waitForTimeout(10000);

    console.log(
        'Resultados encontrados'
    );

    // =========================
    // CREAR CARPETA XML
    // =========================

    if (!fs.existsSync('./xml')) {

        fs.mkdirSync('./xml');

    }

    // =========================
    // DESCARGA MASIVA INTELIGENTE
    // =========================

    console.log(
        'Iniciando descarga masiva inteligente...'
    );

    // Buscar filas reales
    const filas =
        await page.locator('tr').all();

    console.log(
        'Filas encontradas:',
        filas.length
    );

    let contador = 1;

    for (const fila of filas) {

        try {

            // Buscar botón XML
            const botonXML =
                fila.locator(
                    'span.glyphicon-cloud-download'
                );

            const existe =
                await botonXML.count();

            if (existe > 0) {

                console.log(
                    `Procesando fila ${contador}...`
                );

                // Scroll
                await botonXML.first()
                    .scrollIntoViewIfNeeded();

                // Esperar poquito
                await page.waitForTimeout(1500);

                // Esperar descarga
                const downloadPromise =
                    page.waitForEvent(
                        'download',
                        {
                            timeout: 20000
                        }
                    );

                // Click
                await botonXML.first().click({
                    force: true
                });

                // Esperar descarga
                const download =
                    await downloadPromise;

                // Nombre
                const nombre =
                    `xml_${contador}.xml`;

                // Guardar
                await download.saveAs(
                    `./xml/${nombre}`
                );

                console.log(
                    `XML ${contador} descargado`
                );

                // =========================
                // CERRAR POPUPS
                // =========================

                const paginas =
                    context.pages();

                for (const p of paginas) {

                    // Cerrar popup
                    if (p !== page) {

                        try {

                            await p.close();

                        } catch (e) {}

                    }

                }

                // Regresar foco SAT
                await page.bringToFront();

                contador++;

                // Espera humana
                await page.waitForTimeout(4000);

            }

        } catch (error) {

            console.log(
                `Error fila ${contador}`
            );

            console.log(
                error.message
            );

            // Cerrar popup aunque falle
            const paginas =
                context.pages();

            for (const p of paginas) {

                if (p !== page) {

                    try {

                        await p.close();

                    } catch (e) {}

                }

            }

            await page.bringToFront();

            contador++;

        }

    }

    console.log(
        'Descarga masiva completada'
    );

    // =========================
    // LEER XML
    // =========================

    console.log(
        'Leyendo XML...'
    );

    const xml =
        fs.readFileSync(
            './xml/xml_1.xml',
            'utf8'
        );

    const parser =
        new xml2js.Parser({

            explicitArray: false

        });

    const resultadoXML =
        await parser.parseStringPromise(
            xml
        );

    const comprobante =
        resultadoXML['cfdi:Comprobante'];

    const emisor =
        comprobante['cfdi:Emisor'];

    const receptor =
        comprobante['cfdi:Receptor'];

    console.log('');
    console.log(
        '======================'
    );

    console.log('DATOS CFDI');

    console.log(
        '======================'
    );

    console.log(
        'Total:',
        comprobante.$.Total
    );

    console.log(
        'Fecha:',
        comprobante.$.Fecha
    );

    console.log(
        'Moneda:',
        comprobante.$.Moneda
    );

    console.log(
        'Emisor:',
        emisor.$.Nombre
    );

    console.log(
        'RFC Emisor:',
        emisor.$.Rfc
    );

    console.log(
        'Receptor:',
        receptor.$.Nombre
    );

    console.log(
        'RFC Receptor:',
        receptor.$.Rfc
    );

    console.log('');
    console.log(
        'Proceso terminado'
    );

})();