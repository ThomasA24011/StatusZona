<?php
// ============================================================
// helpers/response.php
// Funciones utilitarias compartidas por todos los endpoints
// ============================================================

/**
 * Establece los headers JSON + CORS y termina si es preflight OPTIONS.
 * Llama a esta función al inicio de CADA endpoint.
 */
function setCorsAndJsonHeaders(): void {
    // Permite llamadas desde el frontend en localhost (XAMPP / Vite dev server)
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');

    // Los navegadores envían OPTIONS antes del request real (preflight).
    // Respondemos 204 y cortamos para no ejecutar lógica innecesaria.
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

/**
 * Envía una respuesta JSON de éxito.
 *
 * @param mixed $data     Datos a serializar
 * @param int   $code     Código HTTP (200, 201, etc.)
 */
function sendSuccess(mixed $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode(['success' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Envía una respuesta JSON de error.
 *
 * @param string $message Mensaje de error legible
 * @param int    $code    Código HTTP (400, 404, 422, 500, etc.)
 */
function sendError(string $message, int $code = 400): void {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Lee y decodifica el body JSON del request.
 * Termina con error 400 si el body está vacío o malformado.
 */
function getJsonBody(): array {
    $raw = file_get_contents('php://input');
    if (empty($raw)) {
        sendError('El body de la petición está vacío.', 400);
    }
    $data = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        sendError('JSON malformado: ' . json_last_error_msg(), 400);
    }
    return $data;
}

/**
 * Genera un ID único en formato 'rep-{timestamp_ms}-{random}'.
 * Compatible con el formato que usa el frontend actual.
 */
function generateId(): string {
    return 'rep-' . round(microtime(true) * 1000) . '-' . bin2hex(random_bytes(3));
}

/**
 * Convierte una fila de la BD (snake_case) al formato que espera
 * el frontend JS (camelCase), igualando exactamente la estructura
 * del objeto que antes vivía en localStorage.
 */
function formatReport(array $row): array {
    return [
        'id'           => $row['id'],
        'title'        => $row['title'],
        'serviceType'  => $row['service_type'],
        'severity'     => $row['severity'],
        'status'       => $row['status'],
        'location'     => $row['location'],
        'lat'          => (float) $row['lat'],
        'lng'          => (float) $row['lng'],
        'description'  => $row['description'] ?? '',
        'reporterName' => $row['reporter_name'],
        'votes'        => (int) $row['votes'],
        'reportedAt'   => $row['reported_at'],
        'resolvedAt'   => $row['resolved_at'],
    ];
}
