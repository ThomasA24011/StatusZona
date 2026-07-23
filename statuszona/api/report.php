<?php
// ============================================================
// report.php
// GET    /api/report.php?id=rep-xxx   → Obtiene un reporte
// PUT    /api/report.php?id=rep-xxx   → Actualiza un reporte
// DELETE /api/report.php?id=rep-xxx   → Elimina un reporte
// ============================================================

require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/helpers/response.php';

setCorsAndJsonHeaders();

// El ID llega siempre como query param: ?id=rep-xxx
$id = trim($_GET['id'] ?? '');
if ($id === '') {
    sendError("Falta el parámetro 'id' en la URL.", 400);
}

$method = $_SERVER['REQUEST_METHOD'];

match ($method) {
    'GET'    => handleGetOne($id),
    'PUT'    => handleUpdate($id),
    'DELETE' => handleDelete($id),
    default  => sendError("Método '$method' no permitido en este endpoint.", 405)
};


// ------------------------------------------------------------
// GET — Obtener un reporte por ID
// ------------------------------------------------------------
function handleGetOne(string $id): void {
    $conn = getConnection();

    $stmt = $conn->prepare("SELECT * FROM reports WHERE id = ?");
    $stmt->bind_param('s', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();

    $stmt->close();
    $conn->close();

    if (!$row) {
        sendError("No se encontró ningún reporte con id '$id'.", 404);
    }

    sendSuccess(formatReport($row));
}


// ------------------------------------------------------------
// PUT — Actualizar campos de un reporte existente
// Body JSON (todos opcionales, solo se actualizan los enviados):
// {
//   "title":        "Nuevo título",
//   "serviceType":  "water",
//   "severity":     "low",
//   "location":     "Nueva dirección",
//   "lat":          5.3500,
//   "lng":          -72.4100,
//   "description":  "Texto actualizado",
//   "reporterName": "Nombre",
//   "status":       "resolved"
// }
// ------------------------------------------------------------
function handleUpdate(string $id): void {
    $conn = getConnection();
    $body = getJsonBody();

    // Verificar que el reporte existe
    $check = $conn->prepare("SELECT id FROM reports WHERE id = ?");
    $check->bind_param('s', $id);
    $check->execute();
    if (!$check->get_result()->fetch_assoc()) {
        sendError("No se encontró ningún reporte con id '$id'.", 404);
    }
    $check->close();

    // Construir UPDATE dinámico con solo los campos recibidos
    $allowed = [
        'title'        => 's',
        'service_type' => 's',   // el frontend envía serviceType → mapeamos abajo
        'severity'     => 's',
        'status'       => 's',
        'location'     => 's',
        'lat'          => 'd',
        'lng'          => 'd',
        'description'  => 's',
        'reporter_name'=> 's',
    ];

    // Mapear camelCase del frontend → snake_case de la BD
    $fieldMap = [
        'serviceType'  => 'service_type',
        'reporterName' => 'reporter_name',
    ];

    $setClauses = [];
    $values     = [];
    $types      = '';

    // Manejar resolved_at automáticamente cuando status cambia a 'resolved'
    $statusValue = null;

    foreach ($body as $key => $value) {
        $dbKey = $fieldMap[$key] ?? $key; // traducir camelCase si aplica

        if (!array_key_exists($dbKey, $allowed)) {
            continue; // ignorar campos desconocidos silenciosamente
        }

        // Validaciones puntuales
        if ($dbKey === 'service_type' && !in_array($value, ['electricity', 'water', 'internet'])) {
            sendError("serviceType inválido.", 422);
        }
        if ($dbKey === 'severity' && !in_array($value, ['low', 'medium', 'high'])) {
            sendError("severity inválida.", 422);
        }
        if ($dbKey === 'status' && !in_array($value, ['active', 'resolved'])) {
            sendError("status inválido. Valores: active, resolved.", 422);
        }
        if ($dbKey === 'status') {
            $statusValue = $value;
        }

        $setClauses[] = "`$dbKey` = ?";
        $values[]     = $value;
        $types       .= $allowed[$dbKey];
    }

    if (count($setClauses) === 0) {
        sendError("No se envió ningún campo válido para actualizar.", 422);
    }

    // Si se resuelve el reporte, guardar timestamp
    if ($statusValue === 'resolved') {
        $setClauses[] = "`resolved_at` = NOW()";
    } elseif ($statusValue === 'active') {
        $setClauses[] = "`resolved_at` = NULL";
    }

    $sql = "UPDATE reports SET " . implode(', ', $setClauses) . " WHERE id = ?";
    $values[] = $id;
    $types   .= 's';

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        sendError('Error preparando actualización: ' . $conn->error, 500);
    }

    $stmt->bind_param($types, ...$values);

    if (!$stmt->execute()) {
        sendError('Error al actualizar: ' . $stmt->error, 500);
    }

    $stmt->close();

    // Devolver el reporte actualizado
    $fetch = $conn->prepare("SELECT * FROM reports WHERE id = ?");
    $fetch->bind_param('s', $id);
    $fetch->execute();
    $updated = $fetch->get_result()->fetch_assoc();
    $fetch->close();
    $conn->close();

    sendSuccess(formatReport($updated));
}


// ------------------------------------------------------------
// DELETE — Eliminar un reporte por ID
// ------------------------------------------------------------
function handleDelete(string $id): void {
    $conn = getConnection();

    // Verificar existencia antes de borrar
    $check = $conn->prepare("SELECT id FROM reports WHERE id = ?");
    $check->bind_param('s', $id);
    $check->execute();
    if (!$check->get_result()->fetch_assoc()) {
        sendError("No se encontró ningún reporte con id '$id'.", 404);
    }
    $check->close();

    $stmt = $conn->prepare("DELETE FROM reports WHERE id = ?");
    $stmt->bind_param('s', $id);

    if (!$stmt->execute()) {
        sendError('Error al eliminar el reporte: ' . $stmt->error, 500);
    }

    $stmt->close();
    $conn->close();

    sendSuccess(['deleted' => true, 'id' => $id]);
}
