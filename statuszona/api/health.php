<?php
// ============================================================
// health.php
// GET /api/health.php
// Verifica que la API y la base de datos están operativas.
// Útil para diagnóstico rápido desde el navegador.
// ============================================================

require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/helpers/response.php';

setCorsAndJsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendError('Solo GET permitido.', 405);
}

$conn = getConnection(); // Si falla, getConnection() ya responde con 503

// Verificar que las tablas existen
$tables   = ['reports', 'votes', 'service_types', 'severity_levels'];
$existing = [];

foreach ($tables as $table) {
    $result     = $conn->query("SHOW TABLES LIKE '$table'");
    $existing[] = [
        'table'  => $table,
        'exists' => $result->num_rows > 0
    ];
}

// Contar reportes activos como verificación de datos
$countResult  = $conn->query("SELECT COUNT(*) AS total FROM reports WHERE status = 'active'");
$activeCount  = $countResult ? (int)$countResult->fetch_assoc()['total'] : -1;

$conn->close();

sendSuccess([
    'status'       => 'ok',
    'database'     => DB_NAME,
    'tables'       => $existing,
    'activeReports'=> $activeCount,
    'timestamp'    => date('c'),
    'phpVersion'   => PHP_VERSION,
]);
