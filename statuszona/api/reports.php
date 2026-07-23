<?php
// ============================================================
// reports.php
// GET  /api/reports.php          → Lista todos los reportes
// POST /api/reports.php          → Crea un nuevo reporte
// ============================================================

require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/helpers/response.php';

setCorsAndJsonHeaders();

$method = $_SERVER['REQUEST_METHOD'];

match ($method) {
    'GET'  => handleGetAll(),
    'POST' => handleCreate(),
    default => sendError("Método '$method' no permitido en este endpoint.", 405)
};


// ------------------------------------------------------------
// GET — Listar reportes con filtros opcionales
// Query params:
//   ?service_type=electricity|water|internet
//   ?status=active|resolved
//   ?search=texto libre
//   ?limit=50&offset=0
// ------------------------------------------------------------
function handleGetAll(): void {
    $conn = getConnection();

    // Parámetros de filtro desde query string
    $serviceType = $_GET['service_type'] ?? null;
    $status      = $_GET['status']       ?? null;
    $search      = $_GET['search']       ?? null;
    $limit       = min((int)($_GET['limit']  ?? 100), 500); // máximo 500
    $offset      = max((int)($_GET['offset'] ?? 0),   0);

    // Construcción dinámica de la cláusula WHERE
    $conditions = [];
    $params     = [];
    $types      = '';

    if ($serviceType !== null) {
        $conditions[] = 'r.service_type = ?';
        $params[]     = $serviceType;
        $types       .= 's';
    }

    if ($status !== null) {
        $conditions[] = 'r.status = ?';
        $params[]     = $status;
        $types       .= 's';
    }

    if ($search !== null && trim($search) !== '') {
        $like         = '%' . trim($search) . '%';
        $conditions[] = '(r.title LIKE ? OR r.location LIKE ? OR r.description LIKE ? OR r.reporter_name LIKE ?)';
        $params[]     = $like;
        $params[]     = $like;
        $params[]     = $like;
        $params[]     = $like;
        $types       .= 'ssss';
    }

    $where = count($conditions) > 0 ? 'WHERE ' . implode(' AND ', $conditions) : '';

    $sql = "
        SELECT
            r.id, r.title, r.service_type, r.severity, r.status,
            r.location, r.lat, r.lng, r.description,
            r.reporter_name, r.votes, r.reported_at, r.resolved_at
        FROM reports r
        $where
        ORDER BY
            CASE r.status WHEN 'active' THEN 0 ELSE 1 END,
            r.reported_at DESC
        LIMIT ? OFFSET ?
    ";

    $params[] = $limit;
    $params[] = $offset;
    $types   .= 'ii';

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        sendError('Error preparando consulta: ' . $conn->error, 500);
    }

    if (count($params) > 0) {
        $stmt->bind_param($types, ...$params);
    }

    $stmt->execute();
    $result = $stmt->get_result();

    $reports = [];
    while ($row = $result->fetch_assoc()) {
        $reports[] = formatReport($row);
    }

    // Contadores para el header de la app (activos / resueltos)
    $countSql  = "SELECT status, COUNT(*) AS total FROM reports GROUP BY status";
    $countRes  = $conn->query($countSql);
    $counts    = ['active' => 0, 'resolved' => 0];
    while ($c = $countRes->fetch_assoc()) {
        $counts[$c['status']] = (int) $c['total'];
    }

    $stmt->close();
    $conn->close();

    sendSuccess([
        'reports'       => $reports,
        'total'         => count($reports),
        'activeCount'   => $counts['active'],
        'resolvedCount' => $counts['resolved'],
    ]);
}


// ------------------------------------------------------------
// POST — Crear un nuevo reporte
// Body JSON esperado:
// {
//   "title":        "Apagón en el centro",   (requerido)
//   "serviceType":  "electricity",            (requerido)
//   "severity":     "high",                  (requerido)
//   "location":     "Calle 10 con Cra 20",   (requerido)
//   "lat":          5.3489,                  (requerido)
//   "lng":          -72.4050,               (requerido)
//   "reporterName": "Carlos G.",             (requerido)
//   "description":  "Texto opcional..."      (opcional)
// }
// ------------------------------------------------------------
function handleCreate(): void {
    $conn = getConnection();
    $body = getJsonBody();

    // Validación de campos requeridos
    $required = ['title', 'serviceType', 'severity', 'location', 'lat', 'lng', 'reporterName'];
    foreach ($required as $field) {
        if (empty($body[$field]) && $body[$field] !== 0) {
            sendError("El campo '$field' es obligatorio.", 422);
        }
    }

    // Validar valores permitidos contra catálogos
    $validServices  = ['electricity', 'water', 'internet'];
    $validSeverities = ['low', 'medium', 'high'];

    if (!in_array($body['serviceType'], $validServices)) {
        sendError("serviceType inválido. Valores permitidos: " . implode(', ', $validServices), 422);
    }
    if (!in_array($body['severity'], $validSeverities)) {
        sendError("severity inválida. Valores permitidos: " . implode(', ', $validSeverities), 422);
    }

    // Validar coordenadas numéricas
    $lat = filter_var($body['lat'], FILTER_VALIDATE_FLOAT);
    $lng = filter_var($body['lng'], FILTER_VALIDATE_FLOAT);
    if ($lat === false || $lng === false) {
        sendError("Las coordenadas lat/lng deben ser números decimales válidos.", 422);
    }

    $id          = generateId();
    $title       = trim($body['title']);
    $serviceType = $body['serviceType'];
    $severity    = $body['severity'];
    $location    = trim($body['location']);
    $description = trim($body['description'] ?? '');
    $reporter    = trim($body['reporterName']);

    $sql = "
        INSERT INTO reports
            (id, title, service_type, severity, status, location, lat, lng, description, reporter_name, votes)
        VALUES
            (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, 1)
    ";

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        sendError('Error preparando inserción: ' . $conn->error, 500);
    }

    $stmt->bind_param(
        'sssssddss',
        $id, $title, $serviceType, $severity,
        $location, $lat, $lng,
        $description, $reporter
    );

    if (!$stmt->execute()) {
        sendError('Error al guardar el reporte: ' . $stmt->error, 500);
    }

    // Recuperar el reporte recién creado para devolverlo completo
    $stmt->close();
    $fetch = $conn->prepare("SELECT * FROM reports WHERE id = ?");
    $fetch->bind_param('s', $id);
    $fetch->execute();
    $newReport = $fetch->get_result()->fetch_assoc();
    $fetch->close();
    $conn->close();

    sendSuccess(formatReport($newReport), 201);
}
