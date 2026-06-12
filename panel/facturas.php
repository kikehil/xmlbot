<?php
/**
 * XMLBoot — Vista: Explorador de Comprobantes CFDI
 */
require_once 'config.php';
checkAuth();

$f_inicio = $_GET['f_inicio'] ?? '';
$f_fin    = $_GET['f_fin'] ?? '';
$f_emisor = $_GET['f_emisor'] ?? '';
$f_moneda = $_GET['f_moneda'] ?? '';
$f_tipo   = $_GET['f_tipo'] ?? '';

$facturas = [];
$emisores = [];

try {
    $db = getDB();

    // 1. Obtener lista de RFCs emisores únicos para el autocompletado del filtro
    $q_emi = $db->query("SELECT DISTINCT rfc_emisor, emisor FROM facturas WHERE rfc_emisor IS NOT NULL ORDER BY rfc_emisor ASC");
    $emisores = $q_emi->fetchAll();

    // 2. Construir Query de Búsqueda Dinámica con Filtros
    $where = [];
    $params = [];

    if (!empty($f_inicio)) {
        $where[] = "fecha_emision >= ?";
        $params[] = $f_inicio . ' 00:00:00';
    }
    if (!empty($f_fin)) {
        $where[] = "fecha_emision <= ?";
        $params[] = $f_fin . ' 23:59:59';
    }
    if (!empty($f_emisor)) {
        $where[] = "rfc_emisor = ?";
        $params[] = $f_emisor;
    }
    if (!empty($f_moneda)) {
        $where[] = "moneda = ?";
        $params[] = $f_moneda;
    }
    if (!empty($f_tipo)) {
        $where[] = "tipo_comprobante = ?";
        $params[] = $f_tipo;
    }

    $sql = "SELECT * FROM facturas";
    if (!empty($where)) {
        $sql .= " WHERE " . implode(" AND ", $where);
    }
    $sql .= " ORDER BY id DESC";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $facturas = $stmt->fetchAll();

} catch (PDOException $e) {
    $db_error = $e->getMessage();
}
?>

<div class="view-header">
    <div>
        <h1 class="view-title">Explorador CFDI</h1>
        <p class="view-subtitle">Consulte, filtre y exporte todos los comprobantes fiscales almacenados en MySQL</p>
    </div>
    <div>
        <button onclick="exportTableToExcel('cfdiTable', 'XMLBoot_CFDI_Reporte')" class="btn btn-premium">
            <i class="fa-solid fa-file-excel me-2"></i> Exportar a Excel
        </button>
    </div>
</div>

<?php if (isset($db_error)): ?>
    <div class="alert alert-danger border-0" role="alert" style="background: rgba(255, 88, 88, 0.1); color: #ff5858; border-radius: 12px;">
        <i class="fa-solid fa-circle-exclamation me-2"></i> Error de Base de Datos: <?php echo htmlspecialchars($db_error); ?>
    </div>
<?php endif; ?>

<!-- Tarjeta de Filtros Avanzados -->
<div class="glass-panel p-4 mb-4">
    <h5 class="fw-bold mb-3 text-info"><i class="fa-solid fa-filter me-2"></i> Filtros de Búsqueda</h5>
    
    <form method="GET" action="index.php" class="row g-3">
        <!-- Necesario para mantener la vista en el router index.php -->
        <input type="hidden" name="view" value="facturas">

        <!-- Rango de Fechas -->
        <div class="col-md-3">
            <label for="f_inicio" class="form-label form-label-premium">Fecha Inicio</label>
            <input type="date" name="f_inicio" id="f_inicio" class="form-control form-control-premium" value="<?php echo htmlspecialchars($f_inicio); ?>">
        </div>
        <div class="col-md-3">
            <label for="f_fin" class="form-label form-label-premium">Fecha Fin</label>
            <input type="date" name="f_fin" id="f_fin" class="form-control form-control-premium" value="<?php echo htmlspecialchars($f_fin); ?>">
        </div>

        <!-- Emitter (Emisor) -->
        <div class="col-md-3">
            <label for="f_emisor" class="form-label form-label-premium">Emisor (RFC)</label>
            <select name="f_emisor" id="f_emisor" class="form-select form-control-premium">
                <option value="">-- Todos --</option>
                <?php foreach ($emisores as $emi): ?>
                    <option value="<?php echo htmlspecialchars($emi['rfc_emisor']); ?>" <?php echo $f_emisor === $emi['rfc_emisor'] ? 'selected' : ''; ?>>
                        <?php echo htmlspecialchars($emi['rfc_emisor'] . ' - ' . substr($emi['emisor'], 0, 20)); ?>...
                    </option>
                <?php endforeach; ?>
            </select>
        </div>

        <!-- Moneda -->
        <div class="col-md-1.5">
            <label for="f_moneda" class="form-label form-label-premium">Moneda</label>
            <select name="f_moneda" id="f_moneda" class="form-select form-control-premium">
                <option value="">-- Todas --</option>
                <option value="MXN" <?php echo $f_moneda === 'MXN' ? 'selected' : ''; ?>>MXN</option>
                <option value="USD" <?php echo $f_moneda === 'USD' ? 'selected' : ''; ?>>USD</option>
                <option value="XXX" <?php echo $f_moneda === 'XXX' ? 'selected' : ''; ?>>XXX</option>
            </select>
        </div>

        <!-- Tipo Comprobante -->
        <div class="col-md-1.5">
            <label for="f_tipo" class="form-label form-label-premium">Tipo</label>
            <select name="f_tipo" id="f_tipo" class="form-select form-control-premium">
                <option value="">-- Todos --</option>
                <option value="I" <?php echo $f_tipo === 'I' ? 'selected' : ''; ?>>Ingreso (I)</option>
                <option value="E" <?php echo $f_tipo === 'E' ? 'selected' : ''; ?>>Egreso (E)</option>
                <option value="T" <?php echo $f_tipo === 'T' ? 'selected' : ''; ?>>Traslado (T)</option>
            </select>
        </div>

        <!-- Botones de Acción -->
        <div class="col-12 d-flex justify-content-end gap-2 mt-4">
            <a href="index.php?view=facturas" class="btn btn-premium-outline">
                <i class="fa-solid fa-broom me-2"></i> Limpiar Filtros
            </a>
            <button type="submit" class="btn btn-premium">
                <i class="fa-solid fa-magnifying-glass me-2"></i> Aplicar Filtros
            </button>
        </div>
    </form>
</div>

<!-- Tabla Datatable de Facturas -->
<div class="glass-panel p-4">
    <div class="table-responsive">
        <table id="cfdiTable" class="table table-premium table-dark table-hover w-100 align-middle mb-0">
            <thead>
                <tr>
                    <th>UUID</th>
                    <th>Fecha Emisión</th>
                    <th>RFC Emisor</th>
                    <th>Emisor</th>
                    <th>RFC Receptor</th>
                    <th class="text-center">Tipo</th>
                    <th>Uso CFDI</th>
                    <th>Método</th>
                    <th class="text-end">Total</th>
                    <th class="text-center">Moneda</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($facturas)): ?>
                    <!-- Datatables controlará el texto vacío por sí mismo, se deja el loop normal -->
                <?php else: ?>
                    <?php foreach ($facturas as $f): 
                        $tipo = $f['tipo_comprobante'] ?: 'I';
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
                        <tr>
                            <td class="font-monospace text-light small" style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="<?php echo htmlspecialchars($f['uuid']); ?>">
                                <?php echo htmlspecialchars($f['uuid']); ?>
                            </td>
                            <td class="small text-secondary"><?php echo htmlspecialchars($f['fecha_emision'] ? substr($f['fecha_emision'], 0, 16) : 'N/D'); ?></td>
                            <td class="font-monospace text-white small"><?php echo htmlspecialchars($f['rfc_emisor']); ?></td>
                            <td style="max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="<?php echo htmlspecialchars($f['emisor']); ?>">
                                <?php echo htmlspecialchars($f['emisor']); ?>
                            </td>
                            <td class="font-monospace text-secondary small"><?php echo htmlspecialchars($f['rfc_receptor']); ?></td>
                            <td class="text-center">
                                <span class="badge-custom <?php echo $badge_class; ?>">
                                    <?php echo $tipo_lbl; ?>
                                </span>
                            </td>
                            <td class="font-monospace text-secondary text-center small"><?php echo htmlspecialchars($f['uso_cfdi'] ?: 'N/D'); ?></td>
                            <td class="font-monospace text-secondary text-center small"><?php echo htmlspecialchars($f['metodo_pago'] ?: 'N/D'); ?></td>
                            <td class="text-end fw-bold text-white">$<?php echo number_format((float)$f['total'], 2); ?></td>
                            <td class="text-center text-light fw-bold"><?php echo htmlspecialchars($f['moneda']); ?></td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

<script>
    // Inicializar Datatables con traducción al español y estilo premium una vez cargue jQuery
    document.addEventListener('DOMContentLoaded', () => {
        $('#cfdiTable').DataTable({
            language: {
                url: 'https://cdn.datatables.net/plug-ins/1.13.7/i18n/es-ES.json'
            },
            pageLength: 10,
            order: [[1, 'desc']], // Ordenar por Fecha Emisión por defecto
            columnDefs: [
                { orderable: false, targets: [0, 6, 7] } // Quitar flechas de ordenar para campos no ordenables
            ],
            drawCallback: function() {
                // Ajustar paginador y buscador de Datatable a estilos de Bootstrap 5 y modo oscuro
                $('.dataTables_filter input').addClass('form-control-premium form-control-sm');
                $('.dataTables_length select').addClass('form-control-premium form-control-sm');
            }
        });
    });
</script>
