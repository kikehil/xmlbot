<?php
/**
 * XMLBoot — Archivo de Configuración de Base de Datos y APIs
 */

// Iniciar sesión global en PHP
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Configuración de Base de Datos (VPS Remota)
define('DB_HOST', '85.31.224.248');
define('DB_USER', 'rootr');
define('DB_PASSWORD', 'Netbios85*');
define('DB_NAME', 'sat_xml_bot');
define('DB_PORT', 3306);

// Configuración de la API del Scraper (NodeJS)
define('SCRAPER_API_URL', 'http://localhost:3002');

/**
 * Obtiene la conexión PDO a la base de datos.
 */
function getDB() {
    $host = DB_HOST;
    $db   = DB_NAME;
    $user = DB_USER;
    $pass = DB_PASSWORD;
    $port = DB_PORT;
    $charset = 'utf8mb4';

    $dsn = "mysql:host=$host;dbname=$db;port=$port;charset=$charset";
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];

    try {
        return new PDO($dsn, $user, $pass, $options);
    } catch (\PDOException $e) {
        throw new \PDOException($e->getMessage(), (int)$e->getCode());
    }
}

/**
 * Verifica si el usuario ha iniciado sesión. Si no, lo redirige al login.
 */
function checkAuth() {
    if (!isset($_SESSION['user_id'])) {
        header("Location: login.php");
        exit;
    }
}
?>
