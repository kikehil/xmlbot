<?php
/**
 * XMLBoot — Pantalla de Login de la Plataforma
 */
require_once 'config.php';

// Si ya inició sesión, redirigir al panel
if (isset($_SESSION['user_id'])) {
    header("Location: index.php");
    exit;
}

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email    = trim($_POST['email'] ?? '');
    $password = $_POST['password'] ?? '';

    if (!empty($email) && !empty($password)) {
        try {
            $db = getDB();
            $stmt = $db->prepare("SELECT * FROM usuarios WHERE email = ? LIMIT 1");
            $stmt->execute([$email]);
            $user = $stmt->fetch();

            if ($user && password_verify($password, $user['password'])) {
                // Guardar variables de sesión
                $_SESSION['user_id']    = $user['id'];
                $_SESSION['user_email'] = $user['email'];

                header("Location: index.php");
                exit;
            } else {
                $error = 'Correo electrónico o contraseña incorrectos.';
            }
        } catch (PDOException $e) {
            $error = 'Error de Base de Datos: ' . $e->getMessage();
        }
    } else {
        $error = 'Por favor complete todos los campos.';
    }
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Iniciar Sesión — XMLBoot</title>
    <!-- Bootstrap 5 CSS -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <!-- FontAwesome 6 Icons -->
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css" rel="stylesheet">
    <!-- Estilo Premium XMLBoot -->
    <link href="assets/style.css" rel="stylesheet">
    <style>
        body {
            background: radial-gradient(circle at 10% 20%, rgba(9, 15, 29, 1) 0%, rgba(13, 23, 47, 1) 90%);
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .login-box {
            width: 100%;
            max-width: 450px;
            padding: 40px;
        }
    </style>
</head>
<body>

<div class="login-box glass-panel text-center">
    <!-- Logo -->
    <div class="brand-logo mx-auto mb-3">
        <i class="fa-solid fa-bolt text-white fs-4"></i>
    </div>
    <h2 class="fw-bold mb-1" style="background: var(--gradient-primary); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">XMLBoot</h2>
    <p class="text-secondary mb-4 small text-uppercase tracking-wider">Gestión CFDI SAT Inteligente</p>

    <!-- Alerta de Error -->
    <?php if (!empty($error)): ?>
        <div class="alert alert-danger border-0 text-start py-2" role="alert" style="background: rgba(255, 88, 88, 0.15); color: #ff5858; font-size: 13.5px; border-radius: 8px;">
            <i class="fa-solid fa-triangle-exclamation me-2"></i> <?php echo htmlspecialchars($error); ?>
        </div>
    <?php endif; ?>

    <!-- Formulario -->
    <form method="POST" action="login.php" class="text-start">
        <div class="mb-3">
            <label for="email" class="form-label form-label-premium">Correo Electrónico</label>
            <div class="input-group">
                <span class="input-group-text border-0" style="background: rgba(15, 23, 42, 0.5); color: var(--text-secondary); border-radius: 8px 0 0 8px; border: 1px solid var(--border-color) !important; border-right: none !important;">
                    <i class="fa-regular fa-envelope"></i>
                </span>
                <input type="email" name="email" id="email" class="form-control form-control-premium" placeholder="nombre@correo.com" required style="border-radius: 0 8px 8px 0 !important;">
            </div>
        </div>

        <div class="mb-4">
            <label for="password" class="form-label form-label-premium">Contraseña</label>
            <div class="input-group">
                <span class="input-group-text border-0" style="background: rgba(15, 23, 42, 0.5); color: var(--text-secondary); border-radius: 8px 0 0 8px; border: 1px solid var(--border-color) !important; border-right: none !important;">
                    <i class="fa-solid fa-lock"></i>
                </span>
                <input type="password" name="password" id="password" class="form-control form-control-premium" placeholder="••••••••" required style="border-radius: 0 8px 8px 0 !important;">
            </div>
        </div>

        <button type="submit" class="btn btn-premium w-100 py-3 mb-2 mt-2">
            Iniciar Sesión <i class="fa-solid fa-chevron-right ms-2 small"></i>
        </button>
    </form>

    <div class="mt-4 pt-2 border-top" style="border-color: rgba(255,255,255,0.03) !important;">
        <span class="text-muted small">XMLBoot v1.0.0 — Todos los derechos reservados.</span>
    </div>
</div>

<!-- Bootstrap 5 Bundle JS -->
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
