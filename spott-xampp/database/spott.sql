CREATE DATABASE IF NOT EXISTS spott_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE spott_db;

DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS registrations;
DROP TABLE IF EXISTS event_category;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS locations;
DROP TABLE IF EXISTS organizers;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  user_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  auth_provider VARCHAR(30) NOT NULL DEFAULT 'demo',
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE organizers (
  organizer_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  organization_name VARCHAR(150) NOT NULL,
  description TEXT,
  verification_status VARCHAR(20) NOT NULL DEFAULT 'unverified',
  CONSTRAINT fk_organizer_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE locations (
  location_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  venue_name VARCHAR(150),
  address TEXT NOT NULL,
  city VARCHAR(100),
  latitude DECIMAL(9,6),
  longitude DECIMAL(9,6)
);

CREATE TABLE categories (
  category_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE events (
  event_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organizer_id INT UNSIGNED NOT NULL,
  location_id INT UNSIGNED,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME,
  price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  is_still_happening_confirmed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_event_organizer FOREIGN KEY (organizer_id) REFERENCES organizers(organizer_id) ON DELETE CASCADE,
  CONSTRAINT fk_event_location FOREIGN KEY (location_id) REFERENCES locations(location_id) ON DELETE SET NULL
);

CREATE TABLE event_category (
  event_id INT UNSIGNED NOT NULL,
  category_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (event_id, category_id),
  FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE CASCADE
);

CREATE TABLE registrations (
  registration_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  event_id INT UNSIGNED NOT NULL,
  registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'registered',
  UNIQUE KEY unique_registration (user_id, event_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE
);

CREATE TABLE reports (
  report_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id INT UNSIGNED NOT NULL,
  reported_by INT UNSIGNED NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE,
  FOREIGN KEY (reported_by) REFERENCES users(user_id) ON DELETE CASCADE
);

INSERT INTO users (name, email, auth_provider, role) VALUES
('Demo Attendee', 'attendee@spott.local', 'demo', 'user'),
('Spott Organizer', 'organizer@spott.local', 'demo', 'organizer'),
('Spott Admin', 'admin@spott.local', 'demo', 'admin');

INSERT INTO organizers (user_id, organization_name, description, verification_status) VALUES
(2, 'Spott Community Events', 'Demo organizer for the Phase 3 presentation.', 'verified');

INSERT INTO locations (venue_name, address, city, latitude, longitude) VALUES
('DLSU-D Activity Center', 'De La Salle University-Dasmariñas', 'Dasmariñas', 14.326500, 120.937200),
('The District Imus', 'Imus, Cavite', 'Imus', 14.404700, 120.940000),
('People’s Park', 'Tagaytay City', 'Tagaytay', 14.115300, 120.962100),
('Cavite Provincial Capitol', 'Trece Martires City', 'Trece Martires', 14.280600, 120.866900),
('SM City Bacoor', 'Bacoor, Cavite', 'Bacoor', 14.459700, 120.947700);

INSERT INTO categories (category_name, description) VALUES
('Music', 'Concerts and live performances'),
('Food', 'Food fairs and markets'),
('Workshop', 'Learning and skill-building activities'),
('Sports', 'Sports and fitness events'),
('Community', 'Community meetups and activities');

INSERT INTO events (organizer_id, location_id, title, description, start_datetime, end_datetime, price, status, is_still_happening_confirmed_at) VALUES
(1, 1, 'Campus Music Night', 'Live performances and student bands.', '2026-10-10 18:00:00', '2026-10-10 21:00:00', 150.00, 'active', NOW()),
(1, 2, 'Cavite Food Weekend', 'Local food stalls and community vendors.', '2026-10-17 10:00:00', '2026-10-17 18:00:00', 0.00, 'active', NOW()),
(1, 3, 'Tagaytay Creative Workshop', 'A beginner-friendly creative workshop.', '2026-10-24 13:00:00', '2026-10-24 16:00:00', 350.00, 'active', NULL),
(1, 4, 'Cavite Community Sports Day', 'Friendly games and community activities.', '2026-11-07 08:00:00', '2026-11-07 12:00:00', 50.00, 'active', NOW()),
(1, 5, 'Weekend Makers Meetup', 'Meet local makers, designers and hobbyists.', '2026-11-14 14:00:00', '2026-11-14 17:00:00', 0.00, 'active', NULL);

INSERT INTO event_category (event_id, category_id) VALUES
(1,1),(2,2),(2,5),(3,3),(4,4),(4,5),(5,3),(5,5);
