CREATE DATABASE IF NOT EXISTS campuspulse;
USE campuspulse;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  password_hash VARBINARY(255) NOT NULL,
  role ENUM('Student', 'Lab Assistant', 'Admin') NOT NULL DEFAULT 'Student'
);

CREATE TABLE IF NOT EXISTS resources (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(50) NOT NULL,
  location VARCHAR(120) NOT NULL,
  capacity INT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  resource_id INT NOT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  status ENUM('Confirmed', 'Verified', 'Cancelled') NOT NULL DEFAULT 'Confirmed',
  verified_at DATETIME NULL,
  CONSTRAINT fk_booking_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_booking_resource FOREIGN KEY (resource_id) REFERENCES resources(id),
  INDEX idx_booking_resource_time (resource_id, start_at, end_at)
);

CREATE TABLE IF NOT EXISTS lost_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reporter_id INT NOT NULL,
  title VARCHAR(120) NOT NULL,
  category VARCHAR(50) NOT NULL,
  location VARCHAR(120) NOT NULL,
  status ENUM('Unclaimed', 'Claim_Pending', 'Resolved') NOT NULL DEFAULT 'Unclaimed',
  found_at DATETIME NOT NULL,
  CONSTRAINT fk_item_reporter FOREIGN KEY (reporter_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS claims (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_id INT NOT NULL,
  claimant_id INT NOT NULL,
  proof TEXT NOT NULL,
  status ENUM('Claim_Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Claim_Pending',
  CONSTRAINT fk_claim_item FOREIGN KEY (item_id) REFERENCES lost_items(id),
  CONSTRAINT fk_claim_user FOREIGN KEY (claimant_id) REFERENCES users(id)
);
