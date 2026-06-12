<?php
/**
 * XMLBoot — Vista: Descargar XML
 */
require_once 'config.php';
checkAuth();

// Credenciales SAT por defecto de prueba para conveniencia del contador
$default_rfc = 'GIZE850118H6A';
$default_pass = 'kajaker1';
?>

<div class="view-header">
    <div>
        <h1 class="view-title">Descargar XML</h1>
        <p class="view-subtitle">Conéctate al portal del SAT de forma segura y descarga tus facturas en segundo plano</p>
    </div>
</div>

<div class="row g-4">
    <!-- Formulario de Conexión SAT -->
    <div class="col-lg-5">
        <div class="glass-panel p-4">
            <h4 class="fw-bold mb-4"><i class="fa-solid fa-key me-2 text-info"></i> Acceso Portal SAT</h4>
            
            <form id="satConnectForm">
                <div class="mb-3">
                    <label for="rfc" class="form-label form-label-premium">RFC Emisor / Receptor</label>
                    <input type="text" id="rfc" class="form-control form-control-premium font-monospace text-uppercase" placeholder="ABCD123456XYZ" value="<?php echo htmlspecialchars($default_rfc); ?>" required maxlength="13">
                </div>
                
                <div class="mb-3">
                    <label for="password" class="form-label form-label-premium">Contraseña SAT (CIEC)</label>
                    <input type="password" id="password" class="form-control form-control-premium" placeholder="••••••••" value="<?php echo htmlspecialchars($default_pass); ?>" required>
                </div>
                
                <div class="mb-4">
                    <label for="fecha_inicio" class="form-label form-label-premium">Fecha de Extracción</label>
                    <input type="date" id="fecha_inicio" class="form-control form-control-premium" value="2025-01-01" required>
                    <div class="form-text text-secondary" style="font-size: 11px;">El scraper buscará facturas recibidas el día indicado.</div>
                </div>

                <button type="submit" id="btnConnect" class="btn btn-premium w-100 py-3 fw-bold">
                    <span id="connectSpinner" class="spinner-border spinner-border-sm me-2 d-none" role="status" aria-hidden="true"></span>
                    <i class="fa-solid fa-network-wired me-2"></i> INICIAR CONEXIÓN SAT
                </button>
            </form>
        </div>
    </div>

    <!-- Panel de Progreso, Captcha y Consola -->
    <div class="col-lg-7">
        <!-- 1. Contenedor de Captcha Integrado (Espera del Usuario) -->
        <div id="captchaContainer" class="glass-panel p-4 mb-4 d-none" style="border-color: rgba(0, 242, 254, 0.3);">
            <div class="text-center">
                <h4 class="fw-bold mb-2 text-info"><i class="fa-solid fa-shield-halved me-2"></i> Validación de Captcha</h4>
                <p class="text-secondary small mb-4">El SAT requiere validación humana. Por favor resuelva el captcha a continuación:</p>

                <!-- Imagen del Captcha -->
                <div class="p-3 bg-dark rounded-3 d-inline-block border mb-3" style="border-color: var(--border-color);">
                    <img id="captchaImg" src="" alt="Cargando captcha..." class="img-fluid" style="height: 70px; min-width: 200px; filter: drop-shadow(0 0 10px rgba(0,0,0,0.5));">
                </div>

                <!-- Alerta de Captcha incorrecto -->
                <div id="captchaError" class="alert alert-danger border-0 py-2 d-none font-monospace small mx-auto" role="alert" style="max-width: 320px; background: rgba(255, 88, 88, 0.1); color: #ff5858; border-radius: 8px;">
                    Captcha incorrecto, intente de nuevo.
                </div>

                <!-- Input Captcha -->
                <form id="captchaForm" class="mx-auto" style="max-width: 320px;">
                    <div class="mb-3">
                        <input type="text" id="captchaCode" class="form-control form-control-premium text-center font-monospace fs-5 text-uppercase" placeholder="Código Captcha" autocomplete="off" required maxlength="10">
                    </div>
                    <button type="submit" id="btnSubmitCaptcha" class="btn btn-premium w-100 py-2">
                        <span id="captchaSubmitSpinner" class="spinner-border spinner-border-sm me-2 d-none" role="status" aria-hidden="true"></span>
                        Enviar Captcha <i class="fa-solid fa-paper-plane ms-2 small"></i>
                    </button>
                </form>
            </div>
        </div>

        <!-- 2. Consola Log Scraper (En Vivo) -->
        <div id="consoleCard" class="glass-panel p-4 mb-4 d-none">
            <h4 class="fw-bold mb-3"><i class="fa-solid fa-terminal me-2 text-success"></i> Monitor de Operaciones</h4>
            <div id="scraperConsole" class="console-box mb-3">
                <!-- Líneas inyectadas dinámicamente por main.js -->
            </div>

            <!-- 3. Consola de Progreso de Descargas (Background) -->
            <div id="progressContainer" class="d-none mt-3 pt-3 border-top" style="border-color: rgba(255, 255, 255, 0.05) !important;">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span id="progressCount" class="text-secondary small fw-bold">Descargando...</span>
                    <span id="progressPct" class="fw-bold text-info" style="font-size: 18px;">0%</span>
                </div>
                <div class="progress progress-premium mb-3">
                    <div id="progressBar" class="progress-bar progress-bar-striped progress-bar-animated progress-bar-premium" role="progressbar" style="width: 0%" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
                </div>
            </div>
        </div>

        <!-- 4. Alertas de Resultado -->
        <!-- Alerta Éxito -->
        <div id="downloadSuccessAlert" class="alert alert-success border-0 p-4 d-none" role="alert" style="background: rgba(0, 176, 155, 0.1); border-left: 5px solid #00b09b; border-radius: 12px;">
            <div class="d-flex align-items-start gap-3">
                <i class="fa-solid fa-circle-check fs-2 text-success"></i>
                <div>
                    <h5 class="alert-heading fw-bold mb-1 text-white">¡Descarga Masiva Exitosa!</h5>
                    <p class="mb-3 text-secondary small">Todos los archivos XML CFDI correspondientes al día seleccionado han sido extraídos del portal SAT, procesados para extraer sus campos fiscales y almacenados de forma segura en la base de datos MySQL.</p>
                    <a href="index.php?view=facturas" id="btnViewCFDI" class="btn btn-premium d-inline-block">
                        <i class="fa-solid fa-folder-closed me-2"></i> Explorar Comprobantes Guardados
                    </a>
                </div>
            </div>
        </div>

        <!-- Alerta Error -->
        <div id="downloadErrorAlert" class="alert alert-danger border-0 p-4 d-none" role="alert" style="background: rgba(248, 87, 166, 0.1); border-left: 5px solid #f857a6; border-radius: 12px;">
            <div class="d-flex align-items-start gap-3">
                <i class="fa-solid fa-triangle-exclamation fs-2 text-danger"></i>
                <div>
                    <h5 class="alert-heading fw-bold mb-1 text-white">Fallo en la Extracción SAT</h5>
                    <p id="downloadErrorText" class="mb-0 text-secondary small">Ocurrió un error inesperado al interactuar con el portal de facturación del SAT.</p>
                </div>
            </div>
        </div>
    </div>
</div>
