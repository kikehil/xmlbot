<?php
/**
 * XMLBoot — Manejador Proxy AJAX
 */
require_once 'config.php';

// Validar autenticación
if (!isset($_SESSION['user_id'])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'No autorizado']);
    exit;
}

header('Content-Type: application/json');

$action = $_GET['action'] ?? '';

switch ($action) {
    
    // ==========================================
    // ACCIÓN: CONECTAR AL SAT (Arranca Playwright)
    // ==========================================
    case 'connect':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Método no permitido']);
            exit;
        }

        // Obtener payload
        $input = json_decode(file_get_contents('php://input'), true);
        $rfc = trim($input['rfc'] ?? '');
        $password = $input['password'] ?? '';
        $fecha_inicio = $input['fecha_inicio'] ?? '';

        if (empty($rfc) || empty($password) || empty($fecha_inicio)) {
            echo json_encode(['success' => false, 'error' => 'Campos incompletos']);
            exit;
        }

        // Realizar llamada cURL a la API de Node.js en background
        $ch = curl_init(SCRAPER_API_URL . '/api/sat/connect');
        $payload = json_encode([
            'rfc' => $rfc,
            'password' => $password,
            'fecha_inicio' => $fecha_inicio
        ]);

        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 65); // cURL timeout amplio para dar margen

        $response = curl_exec($ch);
        $err = curl_error($ch);
        curl_close($ch);

        if ($err) {
            echo json_encode(['success' => false, 'error' => 'Fallo al comunicar con servicio de scraping Node: ' . $err]);
        } else {
            echo $response; // Reenviar respuesta cruda del Express API al frontend
        }
        break;

    // ==========================================
    // ACCIÓN: ENVIAR EL CAPTCHA RESUELTO
    // ==========================================
    case 'login':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Método no permitido']);
            exit;
        }

        $input = json_decode(file_get_contents('php://input'), true);
        $sessionId = $input['sessionId'] ?? '';
        $captcha   = trim($input['captcha'] ?? '');

        if (empty($sessionId) || empty($captcha)) {
            echo json_encode(['success' => false, 'error' => 'Datos incompletos']);
            exit;
        }

        // Realizar cURL a la API de Node.js
        $ch = curl_init(SCRAPER_API_URL . '/api/sat/login');
        $payload = json_encode([
            'sessionId' => $sessionId,
            'captcha' => $captcha
        ]);

        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 65);

        $response = curl_exec($ch);
        $err = curl_error($ch);
        curl_close($ch);

        if ($err) {
            echo json_encode(['success' => false, 'error' => 'Fallo de comunicación en login: ' . $err]);
        } else {
            echo $response;
        }
        break;

    // ==========================================
    // ACCIÓN: CONSULTAR ESTATUS DE LA SESIÓN (Poll)
    // ==========================================
    case 'status':
        $sessionId = $_GET['sessionId'] ?? '';

        if (empty($sessionId)) {
            echo json_encode(['success' => false, 'error' => 'SessionId requerido']);
            exit;
        }

        try {
            // Consulta directa ultra rápida a base de datos
            $db = getDB();
            $stmt = $db->prepare("SELECT * FROM sat_sessions WHERE id = ? LIMIT 1");
            $stmt->execute([$sessionId]);
            $session = $stmt->fetch();

            if ($session) {
                echo json_encode([
                    'success' => true,
                    'session' => [
                        'id' => $session['id'],
                        'status' => $session['status'],
                        'total_xml' => (int)$session['total_xml'],
                        'xml_descargados' => (int)$session['xml_descargados'],
                        'progreso' => (int)$session['progreso'],
                        'captcha_base64' => $session['captcha_base64'],
                        'error_message' => $session['error_message']
                    ]
                ]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Sesión no encontrada']);
            }
        } catch (PDOException $e) {
            echo json_encode(['success' => false, 'error' => 'Fallo de base de datos: ' . $e->getMessage()]);
        }
        break;

    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Acción no permitida']);
        break;
}
?>
