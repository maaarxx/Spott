<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/db.php';
$stmt = $pdo->query('SELECT category_id, category_name FROM categories ORDER BY category_name');
echo json_encode(['success'=>true, 'categories'=>$stmt->fetchAll()]);
