<?php
/**
 * XMLBoot — Router y Maquetado General del Panel
 */
require_once 'config.php';

// Validar que el usuario haya iniciado sesión
checkAuth();

// Obtener la vista actual, por defecto 'dashboard'
$view = $_GET['view'] ?? 'dashboard';

// Sanitizar vista para prevenir LFI
$allowed_views = ['dashboard', 'descargar', 'facturas'];
if (!in_array($view, $allowed_views)) {
    $view = 'dashboard';
}

$user_email = $_SESSION['user_email'];
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>XMLBoot — Sistema Inteligente de Gestión CFDI</title>
    <!-- Bootstrap 5 CSS -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <!-- FontAwesome 6 Icons -->
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css" rel="stylesheet">
    <!-- Datatable CSS -->
    <link href="https://cdn.datatables.net/1.13.7/css/dataTables.bootstrap5.min.css" rel="stylesheet">
    <!-- Estilo Premium XMLBoot -->
    <link href="assets/style.css" rel="stylesheet">
</head>
<body>

<div class="app-container">
    <!-- Sidebar -->
    <aside class="sidebar">
        <!-- Brand / Logo -->
        <div class="brand-section">
            <div class="brand-logo">
                <i class="fa-solid fa-bolt text-white"></i>
            </div>
            <span class="brand-name">XMLBoot</span>
        </div>

        <!-- Menú de Navegación -->
        <nav class="menu-section">
            <a href="index.php?view=dashboard" class="menu-item <?php echo $view === 'dashboard' ? 'active' : ''; ?>">
                <i class="fa-solid fa-chart-pie"></i> Dashboard Fiscal
            </a>
            
            <a href="index.php?view=descargar" class="menu-item <?php echo $view === 'descargar' ? 'active' : ''; ?>">
                <i class="fa-solid fa-cloud-arrow-down"></i> Descargar XML
            </a>
            
            <a href="index.php?view=facturas" class="menu-item <?php echo $view === 'facturas' ? 'active' : ''; ?>">
                <i class="fa-solid fa-file-invoice-dollar"></i> Explorador CFDI
            </a>
        </nav>

        <!-- Sección de Usuario -->
        <div class="user-section">
            <div class="user-info">
                <span class="user-name" title="<?php echo htmlspecialchars($user_email); ?>">
                    <?php echo htmlspecialchars(explode('@', $user_email)[0]); ?>
                </span>
                <span class="user-role">Contador Administrador</span>
            </div>
            <a href="logout.php" class="logout-icon" title="Cerrar Sesión">
                <i class="fa-solid fa-power-off"></i>
            </a>
        </div>
    </aside>

    <!-- Contenido Principal -->
    <main class="main-content">
        <?php
        // Renderizar la vista correspondiente
        switch ($view) {
            case 'dashboard':
                include 'dashboard.php';
                break;
            case 'descargar':
                include 'descargar.php';
                break;
            case 'facturas':
                include 'facturas.php';
                break;
            default:
                include 'dashboard.php';
                break;
        }
        ?>
    </main>
</div>

<!-- Bootstrap 5 Bundle JS -->
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<!-- jQuery (Requerido por Datatables) -->
<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
<!-- Datatables Core JS -->
<script src="https://cdn.datatables.net/1.13.7/js/jquery.dataTables.min.js"></script>
<script src="https://cdn.datatables.net/1.13.7/js/dataTables.bootstrap5.min.js"></script>
<!-- SheetJS (Para Exportar a Excel directamente en Frontend) -->
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<!-- Script Custom XMLBoot -->
<script src="assets/main.js"></script>

</body>
</html>
