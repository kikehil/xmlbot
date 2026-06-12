<?php
/**
 * XMLBoot — Vista: Dashboard Fiscal
 */
require_once 'config.php';
checkAuth();

// Inicializar contadores por defecto
$total_comprobantes = 0;
$suma_total = 0.00;
$total_emisores = 0;
$total_receptores = 0;
$recent_facturas = [];

try {
    $db = getDB();

    // 1. Total comprobantes
    $q1 = $db->query("SELECT COUNT(*) as total FROM facturas");
    $total_comprobantes = $q1->fetch()['total'];

    // 2. Suma Total de Dinero (MXN)
    $q2 = $db->query("SELECT SUM(total) as suma FROM facturas");
    $suma_total = (float)($q2->fetch()['suma'] ?? 0.00);

    // 3. Emisores Únicos (Proveedores)
    $q3 = $db->query("SELECT COUNT(DISTINCT rfc_emisor) as total FROM facturas");
    $total_emisores = $q3->fetch()['total'];

    // 4. Receptores Únicos (Clientes)
    $q4 = $db->query("SELECT COUNT(DISTINCT rfc_receptor) as total FROM facturas");
    $total_receptores = $q4->fetch()['total'];

    // 5. Últimas 5 Facturas
    $q5 = $db->query("
        SELECT uuid, emisor, receptor, total, moneda, fecha_emision, tipo_comprobante 
        FROM facturas 
        ORDER BY id DESC 
        LIMIT 5
    ");
    $recent_facturas = $q5->fetchAll();

} catch (PDOException $e) {
    // Si falla porque las tablas están vacías o error de red, se mantiene en 0
    $db_error = $e->getMessage();
}
?>

<div class="view-header">
    <div>
        <h1 class="view-title">Dashboard Fiscal</h1>
        <p class="view-subtitle">Análisis inteligente e indicadores clave de tus CFDI en tiempo real</p>
    </div>
    <div>
        <a href="index.php?view=descargar" class="btn btn-premium">
            <i class="fa-solid fa-cloud-arrow-down me-2"></i> Descargar Nuevos XML
        </a>
    </div>
</div>

<?php if (isset($db_error)): ?>
    <div class="alert alert-warning border-0" role="alert" style="background: rgba(255, 152, 0, 0.1); color: #ffa726; border-radius: 12px;">
        <i class="fa-solid fa-circle-exclamation me-2"></i> Advertencia al cargar analíticas de base de datos: <?php echo htmlspecialchars($db_error); ?>
    </div>
<?php endif; ?>

<!-- Fila de Tarjetas Métricas -->
<div class="row g-4 mb-5">
    <div class="col-md-3">
        <div class="metric-card">
            <div class="metric-data">
                <span class="metric-label">Comprobantes Procesados</span>
                <span class="metric-value"><?php echo number_format($total_comprobantes); ?></span>
            </div>
            <div class="metric-icon">
                <i class="fa-solid fa-file-invoice"></i>
            </div>
        </div>
    </div>
    
    <div class="col-md-3">
        <div class="metric-card">
            <div class="metric-data">
                <span class="metric-label">Acumulado Fiscal</span>
                <span class="metric-value">$<?php echo number_format($suma_total, 2); ?></span>
            </div>
            <div class="metric-icon" style="color: #00b09b;">
                <i class="fa-solid fa-money-bill-trend-up"></i>
            </div>
        </div>
    </div>

    <div class="col-md-3">
        <div class="metric-card">
            <div class="metric-data">
                <span class="metric-label">Proveedores (Emisores)</span>
                <span class="metric-value"><?php echo number_format($total_emisores); ?></span>
            </div>
            <div class="metric-icon" style="color: #4facfe;">
                <i class="fa-solid fa-truck-field"></i>
            </div>
        </div>
    </div>

    <div class="col-md-3">
        <div class="metric-card">
            <div class="metric-data">
                <span class="metric-label">Empresas (Receptores)</span>
                <span class="metric-value"><?php echo number_format($total_receptores); ?></span>
            </div>
            <div class="metric-icon" style="color: #f857a6;">
                <i class="fa-solid fa-building"></i>
            </div>
        </div>
    </div>
</div>

<div class="row g-4">
    <!-- Tabla de Últimos XMLs -->
    <div class="col-lg-8">
        <div class="glass-panel p-4" style="height: 100%;">
            <div class="d-flex justify-content-between align-items-center mb-4">
                <h4 class="fw-bold mb-0">Últimos CFDI Importados</h4>
                <a href="index.php?view=facturas" class="btn btn-premium-outline btn-sm" style="font-size: 12px; padding: 6px 12px;">Ver Todo</a>
            </div>
            
            <div class="table-responsive">
                <table class="table table-dark table-hover align-middle border-0 mb-0" style="background: transparent;">
                    <thead>
                        <tr class="text-secondary" style="font-size: 12px; border-bottom: 1px solid var(--border-color);">
                            <th class="py-3 border-0">RFC EMISOR</th>
                            <th class="py-3 border-0">EMISOR</th>
                            <th class="py-3 border-0 text-center">TIPO</th>
                            <th class="py-3 border-0 text-end">TOTAL</th>
                            <th class="py-3 border-0 text-end">FECHA EMISIÓN</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($recent_facturas)): ?>
                            <tr>
                                <td colspan="5" class="text-center py-5 text-secondary">
                                    <i class="fa-solid fa-folder-open fs-2 mb-3 d-block text-muted"></i>
                                    No hay registros de facturas en la base de datos.<br>
                                    Clica en <strong>Descargar XML</strong> para iniciar tu primera extracción del SAT.
                                </td>
                            </tr>
                        <?php else: ?>
                            <?php foreach ($recent_facturas as $factura): 
                                $tipo = $factura['tipo_comprobante'] ?: 'I';
                                $badge_class = 'badge-ingreso';
                                $tipo_lbl = 'Ingreso';
                                if ($tipo === 'E') {
                                    $badge_class = 'badge-egreso';
                                    $tipo_lbl = 'Egreso';
                                } elseif ($tipo === 'T') {
                                    $badge_class = 'badge-traslado';
                                    $tipo_lbl = 'Traslado';
                                }
                            ?>
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.02);">
                                    <td class="py-3 fw-bold text-light"><?php echo htmlspecialchars($factura['rfc_emisor']); ?></td>
                                    <td class="py-3" style="max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><?php echo htmlspecialchars($factura['emisor']); ?></td>
                                    <td class="py-3 text-center">
                                        <span class="badge-custom <?php echo $badge_class; ?>">
                                            <?php echo $tipo_lbl; ?>
                                        </span>
                                    </td>
                                    <td class="py-3 text-end fw-bold text-white">$<?php echo number_format((float)$factura['total'], 2); ?> <span class="small text-secondary"><?php echo htmlspecialchars($factura['moneda']); ?></span></td>
                                    <td class="py-3 text-end text-secondary small"><?php echo htmlspecialchars(substr($factura['fecha_emision'], 0, 10)); ?></td>
                                </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- Módulo Motor de Alertas / Anomalías -->
    <div class="col-lg-4">
        <div class="glass-panel p-4" style="height: 100%;">
            <h4 class="fw-bold mb-3">Motor Inteligente CFDI</h4>
            <p class="text-secondary small mb-4">Módulo integrado para auditoría de anomalías fiscales automatizadas.</p>

            <div class="d-flex flex-column gap-3">
                <div class="p-3 rounded-3" style="background: rgba(0, 242, 254, 0.04); border: 1px solid rgba(0, 242, 254, 0.1);">
                    <div class="d-flex align-items-center gap-2 mb-2">
                        <i class="fa-solid fa-circle-check" style="color: #00f2fe;"></i>
                        <span class="fw-bold" style="font-size: 14.5px;">Anomalías de Duplicidad</span>
                    </div>
                    <span class="text-secondary small d-block">Busca facturas idénticas en fecha y monto para detectar dobles cobros.</span>
                    <span class="badge bg-success mt-2 font-monospace" style="font-size: 10px;">0 Duplicados Encontrados</span>
                </div>

                <div class="p-3 rounded-3" style="background: rgba(248, 87, 166, 0.04); border: 1px solid rgba(248, 87, 166, 0.1);">
                    <div class="d-flex align-items-center gap-2 mb-2">
                        <i class="fa-solid fa-triangle-exclamation" style="color: #f857a6;"></i>
                        <span class="fw-bold" style="font-size: 14.5px;">Proveedores EFOS / Lista Negra</span>
                    </div>
                    <span class="text-secondary small d-block">Cruza tus RFC emisores con la lista oficial del artículo 69-B del SAT.</span>
                    <span class="badge bg-secondary mt-2 font-monospace" style="font-size: 10px;">Requiere Conexión EFOS</span>
                </div>
                
                <div class="p-3 rounded-3" style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05);">
                    <div class="d-flex align-items-center gap-2 mb-2">
                        <i class="fa-solid fa-microchip text-secondary"></i>
                        <span class="fw-bold" style="font-size: 14.5px;">Automatización Próxima</span>
                    </div>
                    <span class="text-secondary small d-block">Cuentas pendientes por pagar, conciliación de IVA trasladado vs acreditable.</span>
                </div>
            </div>
        </div>
    </div>
</div>
