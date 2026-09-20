<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/db.php';
$data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$eventId = (int)($data['event_id'] ?? 0);
$userId = 1; // Demo attendee for Phase 3
if ($eventId <= 0) { http_response_code(400); echo json_encode(['success'=>false,'message'=>'Invalid event.']); exit; }
try {
  $stmt = $pdo->prepare("INSERT INTO registrations (user_id,event_id) VALUES (?,?) ON DUPLICATE KEY UPDATE status='registered'");
  $stmt->execute([$userId,$eventId]);
  echo json_encode(['success'=>true,'message'=>'RSVP saved successfully.']);
} catch (PDOException $e) {
  http_response_code(500); echo json_encode(['success'=>false,'message'=>'Could not save RSVP.']);
}
