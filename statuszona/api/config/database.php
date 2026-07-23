<?php
// ============================================================
// config/database.php
// Conexión a MySQL con mysqli — StatusZona API
// Ajusta las credenciales según tu entorno XAMPP
// ============================================================

define('DB_HOST',     'localhost');
define('DB_USER',     'root');       // Usuario por defecto en XAMPP
define('DB_PASSWORD', '');           // Contraseña vacía por defecto en XAMPP
define('DB_NAME',     'statuszona');
define('DB_PORT',     3306);
define('DB_CHARSET',  'utf8mb4');

/**
 * Devuelve una conexión mysqli activa.
 * Llama a esta función al inicio de cada endpoint.
 */
function getConnection(): mysqli {
    $conn = new mysqli(DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT);

    if ($conn->connect_error) {
        // Error de conexión — responde JSON y corta la ejecución
        http_response_code(503);
        echo json_encode([
            'success' => false,
            'error'   => 'No se pudo conectar a la base de datos: ' . $conn->connect_error
        ]);
        exit;
    }

    $conn->set_charset(DB_CHARSET);
    return $conn;
}
