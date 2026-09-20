<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/db.php';
$data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$eventId = (int)($data['event_id'] ?? 0);
if ($eventId <= 0) { http_response_code(400); echo json_encode(['success'=>false,'message'=>'Invalid event.']); exit; }
$stmt = $pdo->prepare('UPDATE events SET is_still_happening_confirmed_at=NOW() WHERE event_id=?');
$stmt->execute([$eventId]);
echo json_encode(['success'=>true,'message'=>'Thanks! The event was marked as still happening.']);
