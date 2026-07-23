<?php
// ============================================================
// vote.php
// POST /api/vote.php
// Registra un voto (upvote) sobre un reporte existente.
// Body JSON: { "reportId": "rep-xxx" }
//
// PATCH /api/vote.php
// Marca un reporte como resuelto desde el mapa/lista.
// Body JSON: { "reportId": "rep-xxx", "action": "resolve" }
// ============================================================

require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/helpers/response.php';

setCorsAndJsonHeaders();

$method = $_SERVER['REQUEST_METHOD'];

match ($method) {
    'POST'  => handleVote(),
    'PATCH' => handleAction(),
    default => sendError("Método '$method' no permitido en este endpoint.", 405)
};


// ------------------------------------------------------------
// POST — Registrar un upvote
// Incrementa el contador de votos en 1 e inserta en tabla votes.
// ------------------------------------------------------------
function handleVote(): void {
    $conn = getConnection();
    $body = getJsonBody();

    $reportId = trim($body['reportId'] ?? '');
    if ($reportId === '') {
        sendError("El campo 'reportId' es obligatorio.", 422);
    }

    // Verificar que el reporte existe y está activo
    $check = $conn->prepare("SELECT id, status FROM reports WHERE id = ?");
    $check->bind_param('s', $reportId);
    $check->execute();
    $report = $check->get_result()->fetch_assoc();
    $check->close();

    if (!$report) {
        sendError("No se encontró el reporte '$reportId'.", 404);
    }
    if ($report['status'] === 'resolved') {
        sendError("No se puede votar en un reporte ya resuelto.", 409);
    }

    // Incrementar votos en la tabla principal
    $update = $conn->prepare("UPDATE reports SET votes = votes + 1 WHERE id = ?");
    $update->bind_param('s', $reportId);
    if (!$update->execute()) {
        sendError('Error al registrar el voto: ' . $update->error, 500);
    }
    $update->close();

    // Registrar el voto individual en la tabla votes (para trazabilidad futura)
    $voterIp = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? null;
    $insert  = $conn->prepare("INSERT INTO votes (report_id, voter_ip) VALUES (?, ?)");
    $insert->bind_param('ss', $reportId, $voterIp);
    $insert->execute(); // no es crítico si falla, no cortamos el flujo
    $insert->close();

    // Devolver el reporte actualizado
    $fetch = $conn->prepare("SELECT * FROM reports WHERE id = ?");
    $fetch->bind_param('s', $reportId);
    $fetch->execute();
    $updated = $fetch->get_result()->fetch_assoc();
    $fetch->close();
    $conn->close();

    sendSuccess(formatReport($updated));
}


// ------------------------------------------------------------
// PATCH — Acciones rápidas sobre un reporte
// Actualmente soporta: { "reportId": "...", "action": "resolve" }
// Extensible para: "reopen", "escalate", etc.
// ------------------------------------------------------------
function handleAction(): void {
    $conn = getConnection();
    $body = getJsonBody();

    $reportId = trim($body['reportId'] ?? '');
    $action   = trim($body['action']   ?? '');

    if ($reportId === '' || $action === '') {
        sendError("Los campos 'reportId' y 'action' son obligatorios.", 422);
    }

    // Verificar existencia
    $check = $conn->prepare("SELECT id, status FROM reports WHERE id = ?");
    $check->bind_param('s', $reportId);
    $check->execute();
    $report = $check->get_result()->fetch_assoc();
    $check->close();

    if (!$report) {
        sendError("No se encontró el reporte '$reportId'.", 404);
    }

    match ($action) {
        'resolve' => resolveReport($conn, $reportId, $report),
        'reopen'  => reopenReport($conn, $reportId, $report),
        default   => sendError("Acción '$action' no reconocida. Acciones válidas: resolve, reopen.", 422)
    };
}

function resolveReport(mysqli $conn, string $id, array $report): void {
    if ($report['status'] === 'resolved') {
        sendError("El reporte ya está marcado como resuelto.", 409);
    }

    $stmt = $conn->prepare("UPDATE reports SET status = 'resolved', resolved_at = NOW() WHERE id = ?");
    $stmt->bind_param('s', $id);
    if (!$stmt->execute()) {
        sendError('Error al resolver el reporte: ' . $stmt->error, 500);
    }
    $stmt->close();

    $fetch = $conn->prepare("SELECT * FROM reports WHERE id = ?");
    $fetch->bind_param('s', $id);
    $fetch->execute();
    $updated = $fetch->get_result()->fetch_assoc();
    $fetch->close();
    $conn->close();

    sendSuccess(formatReport($updated));
}

function reopenReport(mysqli $conn, string $id, array $report): void {
    if ($report['status'] === 'active') {
        sendError("El reporte ya está activo.", 409);
    }

    $stmt = $conn->prepare("UPDATE reports SET status = 'active', resolved_at = NULL WHERE id = ?");
    $stmt->bind_param('s', $id);
    if (!$stmt->execute()) {
        sendError('Error al reabrir el reporte: ' . $stmt->error, 500);
    }
    $stmt->close();

    $fetch = $conn->prepare("SELECT * FROM reports WHERE id = ?");
    $fetch->bind_param('s', $id);
    $fetch->execute();
    $updated = $fetch->get_result()->fetch_assoc();
    $fetch->close();
    $conn->close();

    sendSuccess(formatReport($updated));
}
