<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/db.php';

$q = trim($_GET['q'] ?? '');
$category = trim($_GET['category'] ?? '');
$city = trim($_GET['city'] ?? '');
$date = trim($_GET['date'] ?? '');
$maxPrice = $_GET['max_price'] ?? '';

$sql = "SELECT e.event_id, e.title, e.description, e.start_datetime, e.end_datetime, e.price,
               e.status, e.is_still_happening_confirmed_at,
               o.organization_name, o.verification_status,
               l.venue_name, l.address, l.city,
               GROUP_CONCAT(DISTINCT c.category_name ORDER BY c.category_name SEPARATOR ', ') AS categories,
               (SELECT COUNT(*) FROM registrations r WHERE r.event_id=e.event_id AND r.status='registered') AS registrations
        FROM events e
        JOIN organizers o ON o.organizer_id=e.organizer_id
        LEFT JOIN locations l ON l.location_id=e.location_id
        LEFT JOIN event_category ec ON ec.event_id=e.event_id
        LEFT JOIN categories c ON c.category_id=ec.category_id
        WHERE e.status='active'";
$params = [];

if ($q !== '') {
  $sql .= " AND (e.title LIKE :q OR e.description LIKE :q OR o.organization_name LIKE :q OR l.city LIKE :q OR l.venue_name LIKE :q)";
  $params[':q'] = "%$q%";
}
if ($category !== '') {
  $sql .= " AND EXISTS (SELECT 1 FROM event_category ec2 JOIN categories c2 ON c2.category_id=ec2.category_id WHERE ec2.event_id=e.event_id AND c2.category_name=:category)";
  $params[':category'] = $category;
}
if ($city !== '') {
  $sql .= " AND l.city=:city";
  $params[':city'] = $city;
}
if ($date !== '') {
  $sql .= " AND DATE(e.start_datetime)=:event_date";
  $params[':event_date'] = $date;
}
if ($maxPrice !== '' && is_numeric($maxPrice)) {
  $sql .= " AND e.price <= :max_price";
  $params[':max_price'] = (float)$maxPrice;
}

$sql .= " GROUP BY e.event_id ORDER BY e.start_datetime ASC";
$stmt = $pdo->prepare($sql);
$stmt->execute($params);

echo json_encode(['success'=>true, 'count'=>$stmt->rowCount(), 'events'=>$stmt->fetchAll()], JSON_UNESCAPED_UNICODE);
