<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/db.php';
$data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$eventId = (int)($data['event_id'] ?? 0);
$reason = trim($data['reason'] ?? '');
if ($eventId <= 0 || $reason === '') { http_response_code(400); echo json_encode(['success'=>false,'message'=>'Event and report reason are required.']); exit; }
$stmt = $pdo->prepare('INSERT INTO reports (event_id, reported_by, reason) VALUES (?,?,?)');
$stmt->execute([$eventId,1,$reason]);
echo json_encode(['success'=>true,'message'=>'Report submitted for admin review.']);
