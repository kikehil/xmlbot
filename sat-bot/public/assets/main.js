/**
 * XMLBoot — JavaScript Control de UI, AJAX y Polling
 */

// Polling interval tracker
let pollInterval = null;
let currentSessionId = null;

document.addEventListener('DOMContentLoaded', () => {
    // Inicializar listener de formulario de conexión
    const connectForm = document.getElementById('satConnectForm');
    if (connectForm) {
        connectForm.addEventListener('submit', handleSatConnect);
    }

    // Inicializar listener de formulario de trámites
    const tramiteForm = document.getElementById('tramiteForm');
    if (tramiteForm) {
        tramiteForm.addEventListener('submit', handleTramiteConnect);
    }

    // Inicializar listener de envío de captcha
    const captchaForm = document.getElementById('captchaForm');
    if (captchaForm) {
        captchaForm.addEventListener('submit', handleCaptchaSubmit);
    }
});

/**
 * Agrega una línea con formato al cuadro de consola en la UI.
 */
function appendConsoleLog(message, type = 'info') {
    const consoleBox = document.getElementById('scraperConsole');
    if (!consoleBox) return;

    const line = document.createElement('div');
    line.className = `console-line ${type}`;

    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    
    line.innerHTML = `<span class="timestamp">[${timeStr}]</span> ${message}`;
    consoleBox.appendChild(line);
    
    // Auto-scroll al fondo
    consoleBox.scrollTop = consoleBox.scrollHeight;
}

/**
 * Maneja la conexión inicial al SAT.
 */
async function handleSatConnect(e) {
    e.preventDefault();

    const btnConnect = document.getElementById('btnConnect');
    const spinner = document.getElementById('connectSpinner');
    const contribuyenteId = document.getElementById('contribuyenteId').value;
    const fecha = document.getElementById('fecha_inicio').value;

    if (!contribuyenteId || !fecha) {
        alert('Por favor seleccione un contribuyente y una fecha.');
        return;
    }

    // Bloquear controles y mostrar carga
    btnConnect.disabled = true;
    spinner.classList.remove('d-none');
    
    // Reiniciar consola
    const consoleBox = document.getElementById('scraperConsole');
    if (consoleBox) consoleBox.innerHTML = '';
    
    appendConsoleLog('Iniciando proceso de conexión al SAT...', 'info');

    try {
        const response = await fetch('/api/sat/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contribuyenteId, fecha_inicio: fecha })
        });

        const data = await response.json();

        if (data.success) {
            currentSessionId = data.sessionId;
            appendConsoleLog(`Sesión de scraping iniciada con ID #${currentSessionId}`, 'success');
            appendConsoleLog('Lanzando instancia virtual de Playwright en VPS...', 'info');
            
            // Mostrar bloque de consola
            document.getElementById('consoleCard').classList.remove('d-none');

            // Iniciar Polling de Estatus
            startStatusPolling(currentSessionId);
        } else {
            appendConsoleLog(`Error al inicializar sesión: ${data.error}`, 'error');
            btnConnect.disabled = false;
            spinner.classList.add('d-none');
        }
    } catch (err) {
        appendConsoleLog(`Error en red de AJAX: ${err.message}`, 'error');
        btnConnect.disabled = false;
        spinner.classList.add('d-none');
    }
}

/**
 * Arranca el polling continuo para monitorear el estatus de la descarga del SAT.
 */
function startStatusPolling(sessionId) {
    if (pollInterval) clearInterval(pollInterval);

    pollInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/sat/status?sessionId=${sessionId}`);
            const data = await response.json();

            if (!data.success) {
                appendConsoleLog(`Error en polling: ${data.error}`, 'error');
                return;
            }

            const session = data.session;
            updateUIStatus(session);

        } catch (err) {
            console.error('Error en polling status:', err);
        }
    }, 2000); // Poll cada 2 segundos
}

/**
 * Actualiza los elementos de la interfaz basados en el estado actual de sat_sessions.
 */
let lastStatus = '';
function updateUIStatus(session) {
    const status = session.status;
    const progressContainer = document.getElementById('progressContainer');
    const captchaContainer = document.getElementById('captchaContainer');
    const connectSpinner = document.getElementById('connectSpinner');

    // Registrar cambios de estatus en consola
    if (status !== lastStatus) {
        appendConsoleLog(`Estatus de descarga cambiado a: <strong>${status.toUpperCase()}</strong>`, 'info');
        lastStatus = status;
    }

    if (status === 'esperando_captcha') {
        // Detener spinner de conexión y pintar el captcha
        connectSpinner.classList.add('d-none');
        captchaContainer.classList.remove('d-none');
        progressContainer.classList.add('d-none');

        // Cargar imagen
        const captchaImg = document.getElementById('captchaImg');
        captchaImg.src = `data:image/png;base64,${session.captcha_base64}`;

        if (session.error_message) {
            document.getElementById('captchaError').classList.remove('d-none');
            document.getElementById('captchaError').innerText = session.error_message;
            appendConsoleLog(session.error_message, 'error');
            
            // Reactivar inputs de captcha
            document.getElementById('captchaCode').disabled = false;
            document.getElementById('btnSubmitCaptcha').disabled = false;
            document.getElementById('captchaSubmitSpinner').classList.add('d-none');
        } else {
            document.getElementById('captchaError').classList.add('d-none');
            appendConsoleLog('Captcha cargado exitosamente. Ingrese el código en pantalla.', 'success');
        }
    }

    if (status === 'iniciando_sesion') {
        captchaContainer.classList.add('d-none');
        appendConsoleLog('Enviando código al navegador SAT y validando credenciales...', 'info');
    }

    if (status === 'iniciado') {
        captchaContainer.classList.add('d-none');
        appendConsoleLog('Autenticación exitosa en el SAT. Navegando al módulo de descargas...', 'success');
    }

    if (status === 'buscando') {
        appendConsoleLog('Buscando CFDI recibidos para la fecha seleccionada...', 'info');
    }

    if (status === 'descargando') {
        captchaContainer.classList.add('d-none');
        if (document.getElementById('tramiteForm')) {
            appendConsoleLog('Navegando y solicitando descarga del documento PDF en el portal del SAT...', 'info');
        } else {
            progressContainer.classList.remove('d-none');

            // Actualizar barra de progreso
            const pct = session.progreso;
            const downloaded = session.xml_descargados;
            const total = session.total_xml;

            const progressBar = document.getElementById('progressBar');
            const progressPct = document.getElementById('progressPct');
            const progressCount = document.getElementById('progressCount');

            progressBar.style.width = `${pct}%`;
            progressBar.setAttribute('aria-valuenow', pct);
            progressPct.innerText = `${pct}%`;
            progressCount.innerText = `Descargados: ${downloaded} de ${total} XMLs`;

            appendConsoleLog(`Descargados ${downloaded}/${total} XMLs (${pct}%)`, 'info');
        }
    }

    if (status === 'completado') {
        clearInterval(pollInterval);
        connectSpinner.classList.add('d-none');
        document.getElementById('downloadSuccessAlert').classList.remove('d-none');

        if (document.getElementById('tramiteForm')) {
            appendConsoleLog('¡Trámite completado exitosamente! 🚀', 'success');
            appendConsoleLog('El documento PDF ha sido guardado en el servidor y registrado.', 'success');
            appendConsoleLog('Recargando historial de documentos en 3 segundos...', 'info');
            setTimeout(() => {
                window.location.reload();
            }, 3000);
        } else {
            appendConsoleLog('¡Descarga masiva y procesamiento completado exitosamente! 🚀', 'success');
            appendConsoleLog('Todos los XML han sido parseados y registrados en MySQL.', 'success');

            // UI Completado
            const progressBar = document.getElementById('progressBar');
            if (progressBar) {
                progressBar.style.width = '100%';
                progressBar.setAttribute('aria-valuenow', 100);
            }
            const progressPct = document.getElementById('progressPct');
            if (progressPct) progressPct.innerText = '100%';
            
            // Clic en actualizar o ver facturas
            const btnView = document.getElementById('btnViewCFDI');
            if (btnView) btnView.classList.remove('d-none');
        }
    }

    if (status === 'error') {
        clearInterval(pollInterval);
        appendConsoleLog(`Proceso terminado con error: ${session.error_message}`, 'error');
        
        connectSpinner.classList.add('d-none');
        captchaContainer.classList.add('d-none');
        
        document.getElementById('downloadErrorAlert').classList.remove('d-none');
        document.getElementById('downloadErrorText').innerText = session.error_message;
        
        // Desbloquear botón de conexión para reintento
        document.getElementById('btnConnect').disabled = false;
    }
}

/**
 * Envía el código de captcha digitado manualmente.
 */
async function handleCaptchaSubmit(e) {
    e.preventDefault();

    const captchaCode = document.getElementById('captchaCode').value.trim().toUpperCase();
    if (!captchaCode) {
        alert('Por favor ingrese el código del captcha.');
        return;
    }

    const btnSubmit = document.getElementById('btnSubmitCaptcha');
    const spinner = document.getElementById('captchaSubmitSpinner');

    btnSubmit.disabled = true;
    document.getElementById('captchaCode').disabled = true;
    spinner.classList.remove('d-none');

    appendConsoleLog(`Enviando código de captcha: ${captchaCode}...`, 'info');

    try {
        const response = await fetch('/api/sat/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: currentSessionId, captcha: captchaCode })
        });

        const data = await response.json();

        if (data.success) {
            appendConsoleLog('Captcha enviado correctamente. Procesando login...', 'success');
            // Ocultar modal/box del captcha
            document.getElementById('captchaContainer').classList.add('d-none');
        } else {
            appendConsoleLog(`Error en el login: ${data.error}`, 'error');
        }
    } catch (err) {
        appendConsoleLog(`Error al enviar captcha: ${err.message}`, 'error');
        btnSubmit.disabled = false;
        document.getElementById('captchaCode').disabled = false;
        spinner.classList.add('d-none');
    }
}

/**
 * Exporta una tabla HTML a un archivo Excel utilizando SheetJS.
 */
function exportTableToExcel(tableId, filename = '') {
    const tableSelect = document.getElementById(tableId);
    if (!tableSelect) return;

    const ws = XLSX.utils.table_to_sheet(tableSelect);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "CFDIs Descargados");

    const finalFilename = filename ? `${filename}.xlsx` : `reporte_cfdi_${Date.now()}.xlsx`;
    XLSX.writeFile(wb, finalFilename);
}

/**
 * Maneja la conexión al SAT para trámites de documentos.
 */
async function handleTramiteConnect(e) {
    e.preventDefault();

    const btnConnect = document.getElementById('btnConnect');
    const spinner = document.getElementById('connectSpinner');
    const contribuyenteId = document.getElementById('contribuyenteId').value;
    const tipo_documento = document.getElementById('tipo_documento').value;

    if (!contribuyenteId || !tipo_documento) {
        alert('Por favor seleccione un contribuyente y un trámite.');
        return;
    }

    // Bloquear controles y mostrar carga
    btnConnect.disabled = true;
    spinner.classList.remove('d-none');
    
    // Ocultar alertas previas si existen
    const successAlert = document.getElementById('downloadSuccessAlert');
    if (successAlert) successAlert.classList.add('d-none');
    const errorAlert = document.getElementById('downloadErrorAlert');
    if (errorAlert) errorAlert.classList.add('d-none');
    
    // Reiniciar consola
    const consoleBox = document.getElementById('scraperConsole');
    if (consoleBox) consoleBox.innerHTML = '';
    
    appendConsoleLog('Iniciando proceso de conexión al SAT para trámite...', 'info');

    try {
        const response = await fetch('/api/sat/connect-tramite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contribuyenteId, tipo_documento })
        });

        const data = await response.json();

        if (data.success) {
            currentSessionId = data.sessionId;
            appendConsoleLog(`Sesión de scraping iniciada con ID #${currentSessionId}`, 'success');
            appendConsoleLog('Lanzando instancia virtual de Playwright en VPS...', 'info');
            
            // Mostrar bloque de consola
            document.getElementById('consoleCard').classList.remove('d-none');

            // Iniciar Polling de Estatus
            startStatusPolling(currentSessionId);
        } else {
            appendConsoleLog(`Error al inicializar sesión: ${data.error}`, 'error');
            btnConnect.disabled = false;
            spinner.classList.add('d-none');
        }
    } catch (err) {
        appendConsoleLog(`Error en red de AJAX: ${err.message}`, 'error');
        btnConnect.disabled = false;
        spinner.classList.add('d-none');
    }
}
