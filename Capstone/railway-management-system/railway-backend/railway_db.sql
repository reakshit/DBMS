-- =====================================================================
--  RAILWAY MANAGEMENT SYSTEM  |  MySQL 8.0+  |  run in MySQL Workbench
--  Sections: 1 Tables | 2 Indexes | 3 Functions & Procedures | 4 Triggers
--            5 Views  | 6 Sample data | 7 Demo / test script
-- =====================================================================

DROP DATABASE IF EXISTS railway_db;
CREATE DATABASE railway_db CHARACTER SET utf8mb4;
USE railway_db;

-- =====================================================================
-- 1. TABLES  (3NF; see railway_design.md for the normalization steps)
-- =====================================================================

CREATE TABLE users (
  user_id        INT AUTO_INCREMENT PRIMARY KEY,
  full_name      VARCHAR(100) NOT NULL,
  email          VARCHAR(120) NOT NULL UNIQUE,
  phone          VARCHAR(15)  NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,              -- store bcrypt hash from the backend, never plain text
  role           ENUM('PASSENGER','STAFF','ADMIN') NOT NULL DEFAULT 'PASSENGER',
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stations (
  station_id    INT AUTO_INCREMENT PRIMARY KEY,
  station_code  VARCHAR(5)   NOT NULL UNIQUE,
  station_name  VARCHAR(100) NOT NULL,
  city          VARCHAR(60)  NOT NULL,
  state         VARCHAR(60)  NOT NULL
);

CREATE TABLE trains (
  train_id      INT AUTO_INCREMENT PRIMARY KEY,
  train_number  VARCHAR(6)   NOT NULL UNIQUE,
  train_name    VARCHAR(100) NOT NULL,
  train_type    ENUM('LOCAL','EXPRESS','SUPERFAST','RAJDHANI','SHATABDI') NOT NULL DEFAULT 'EXPRESS',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

-- Route of a train: ordered stops. day_offset = day number (0 = origin day) on which the stop times apply.
CREATE TABLE train_stops (
  train_id        INT NOT NULL,
  stop_seq        TINYINT UNSIGNED NOT NULL,
  station_id      INT NOT NULL,
  arrival_time    TIME NULL,                          -- NULL at origin
  departure_time  TIME NULL,                          -- NULL at terminus
  day_offset      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  distance_km     INT NOT NULL,                       -- cumulative distance from origin
  PRIMARY KEY (train_id, stop_seq),
  UNIQUE KEY uq_train_station (train_id, station_id),
  CONSTRAINT fk_stop_train   FOREIGN KEY (train_id)   REFERENCES trains(train_id),
  CONSTRAINT fk_stop_station FOREIGN KEY (station_id) REFERENCES stations(station_id),
  CONSTRAINT chk_stop_dist   CHECK (distance_km >= 0)
);

CREATE TABLE coach_classes (
  class_id     TINYINT UNSIGNED PRIMARY KEY,
  class_code   VARCHAR(3)  NOT NULL UNIQUE,           -- SL, 3A, 2A, 1A
  class_name   VARCHAR(40) NOT NULL,
  rate_per_km  DECIMAL(6,2) NOT NULL CHECK (rate_per_km > 0)
);

CREATE TABLE train_coaches (
  coach_id      INT AUTO_INCREMENT PRIMARY KEY,
  train_id      INT NOT NULL,
  class_id      TINYINT UNSIGNED NOT NULL,
  coach_number  VARCHAR(4) NOT NULL,                  -- S1, B1, A1 ...
  total_seats   SMALLINT NOT NULL CHECK (total_seats > 0),
  UNIQUE KEY uq_train_coach (train_id, coach_number),
  CONSTRAINT fk_coach_train FOREIGN KEY (train_id) REFERENCES trains(train_id),
  CONSTRAINT fk_coach_class FOREIGN KEY (class_id) REFERENCES coach_classes(class_id)
);

CREATE TABLE seats (
  seat_id      INT AUTO_INCREMENT PRIMARY KEY,
  coach_id     INT NOT NULL,
  seat_number  SMALLINT NOT NULL,
  berth_type   VARCHAR(12) NOT NULL,
  UNIQUE KEY uq_coach_seat (coach_id, seat_number),
  CONSTRAINT fk_seat_coach FOREIGN KEY (coach_id) REFERENCES train_coaches(coach_id)
);

-- One row = one train on one date (the bookable unit)
CREATE TABLE train_runs (
  run_id        INT AUTO_INCREMENT PRIMARY KEY,
  train_id      INT NOT NULL,
  journey_date  DATE NOT NULL,                        -- date the train leaves its origin
  status        ENUM('SCHEDULED','DEPARTED','CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
  UNIQUE KEY uq_train_date (train_id, journey_date),
  CONSTRAINT fk_run_train FOREIGN KEY (train_id) REFERENCES trains(train_id)
);

CREATE TABLE bookings (
  booking_id       INT AUTO_INCREMENT PRIMARY KEY,
  pnr              CHAR(10) NULL UNIQUE,
  user_id          INT NOT NULL,
  run_id           INT NOT NULL,
  class_id         TINYINT UNSIGNED NOT NULL,
  from_station_id  INT NOT NULL,
  to_station_id    INT NOT NULL,
  from_seq         TINYINT UNSIGNED NOT NULL,         -- deliberate denormalization: speeds up seat-overlap checks
  to_seq           TINYINT UNSIGNED NOT NULL,
  booking_time     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total_fare       DECIMAL(10,2) NOT NULL DEFAULT 0,
  status           ENUM('ACTIVE','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT fk_book_user  FOREIGN KEY (user_id)         REFERENCES users(user_id),
  CONSTRAINT fk_book_run   FOREIGN KEY (run_id)          REFERENCES train_runs(run_id),
  CONSTRAINT fk_book_class FOREIGN KEY (class_id)        REFERENCES coach_classes(class_id),
  CONSTRAINT fk_book_from  FOREIGN KEY (from_station_id) REFERENCES stations(station_id),
  CONSTRAINT fk_book_to    FOREIGN KEY (to_station_id)   REFERENCES stations(station_id),
  CONSTRAINT chk_book_seq  CHECK (from_seq < to_seq)
);

CREATE TABLE passengers (
  passenger_id  INT AUTO_INCREMENT PRIMARY KEY,
  booking_id    INT NOT NULL,
  name          VARCHAR(100) NOT NULL,
  age           TINYINT UNSIGNED NOT NULL,
  gender        ENUM('M','F','O') NOT NULL,
  seat_id       INT NULL,
  status        ENUM('CONFIRMED','WAITLISTED','CANCELLED') NOT NULL,
  waitlist_no   INT NULL,
  fare          DECIMAL(10,2) NOT NULL,               -- fare snapshot at booking time (rates may change later)
  CONSTRAINT fk_pass_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE,
  CONSTRAINT fk_pass_seat    FOREIGN KEY (seat_id)    REFERENCES seats(seat_id),
  CONSTRAINT chk_pass_age    CHECK (age BETWEEN 1 AND 120),
  -- only CONFIRMED passengers hold a seat
  CONSTRAINT chk_pass_seat   CHECK ((status = 'CONFIRMED' AND seat_id IS NOT NULL)
                                 OR (status <> 'CONFIRMED' AND seat_id IS NULL))
);

CREATE TABLE payments (
  payment_id  INT AUTO_INCREMENT PRIMARY KEY,
  booking_id  INT NOT NULL,
  txn_type    ENUM('PAYMENT','REFUND') NOT NULL,
  amount      DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  method      ENUM('UPI','CARD','NETBANKING','WALLET') NOT NULL,
  status      ENUM('SUCCESS','FAILED') NOT NULL DEFAULT 'SUCCESS',
  txn_ref     VARCHAR(40) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pay_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id)
);

CREATE TABLE cancellations (
  cancellation_id  INT AUTO_INCREMENT PRIMARY KEY,
  passenger_id     INT NOT NULL UNIQUE,
  freed_seat_id    INT NULL,                          -- NULL if the passenger was waitlisted (no seat freed)
  refund_amount    DECIMAL(10,2) NOT NULL DEFAULT 0,
  cancelled_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cancel_pass FOREIGN KEY (passenger_id)  REFERENCES passengers(passenger_id),
  CONSTRAINT fk_cancel_seat FOREIGN KEY (freed_seat_id) REFERENCES seats(seat_id)
);

CREATE TABLE fare_audit (
  audit_id    INT AUTO_INCREMENT PRIMARY KEY,
  class_id    TINYINT UNSIGNED NOT NULL,
  old_rate    DECIMAL(6,2) NOT NULL,
  new_rate    DECIMAL(6,2) NOT NULL,
  changed_by  VARCHAR(100) NOT NULL,
  changed_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_class FOREIGN KEY (class_id) REFERENCES coach_classes(class_id)
);

-- =====================================================================
-- 2. INDEXES  (use EXPLAIN before/after in your report)
-- =====================================================================
CREATE INDEX idx_stops_station   ON train_stops (station_id, train_id);   -- train search by station
CREATE INDEX idx_runs_date       ON train_runs (journey_date);
CREATE INDEX idx_bookings_user   ON bookings (user_id);
CREATE INDEX idx_bookings_run    ON bookings (run_id, class_id);          -- overlap / waitlist queries
CREATE INDEX idx_pass_seat       ON passengers (seat_id, status);         -- "is this seat taken?"
CREATE INDEX idx_pass_waitlist   ON passengers (status, waitlist_no);

-- =====================================================================
-- 3. FUNCTIONS & STORED PROCEDURES
-- =====================================================================
DELIMITER $$

-- Departure datetime of a run from a given stop
CREATE FUNCTION fn_departure(p_run_id INT, p_seq TINYINT UNSIGNED)
RETURNS DATETIME
READS SQL DATA
BEGIN
  DECLARE v_dep DATETIME;
  SELECT TIMESTAMP(DATE_ADD(r.journey_date, INTERVAL s.day_offset DAY), s.departure_time)
    INTO v_dep
    FROM train_runs r
    JOIN train_stops s ON s.train_id = r.train_id
   WHERE r.run_id = p_run_id AND s.stop_seq = p_seq;
  RETURN v_dep;
END$$

-- Seats of a class still free for the segment [from_seq, to_seq) of a run.
-- A seat booked A->B can be sold again for B->C (segment overlap logic).
CREATE FUNCTION fn_available_seats(p_run_id INT, p_class_id TINYINT UNSIGNED,
                                   p_from_seq TINYINT UNSIGNED, p_to_seq TINYINT UNSIGNED)
RETURNS INT
READS SQL DATA
BEGIN
  DECLARE v_count INT;
  SELECT COUNT(*) INTO v_count
    FROM train_runs r
    JOIN train_coaches tc ON tc.train_id = r.train_id AND tc.class_id = p_class_id
    JOIN seats s          ON s.coach_id = tc.coach_id
   WHERE r.run_id = p_run_id
     AND NOT EXISTS (SELECT 1
                       FROM passengers p
                       JOIN bookings b ON b.booking_id = p.booking_id
                      WHERE p.seat_id = s.seat_id AND p.status = 'CONFIRMED'
                        AND b.run_id = p_run_id
                        AND b.from_seq < p_to_seq AND b.to_seq > p_from_seq);
  RETURN v_count;
END$$

-- Helper: add a coach and auto-generate its seats
CREATE PROCEDURE sp_add_coach(IN p_train_id INT, IN p_class_id TINYINT UNSIGNED,
                              IN p_coach_no VARCHAR(4), IN p_seats SMALLINT)
BEGIN
  DECLARE i SMALLINT DEFAULT 1;
  DECLARE v_coach_id INT;
  INSERT INTO train_coaches (train_id, class_id, coach_number, total_seats)
  VALUES (p_train_id, p_class_id, p_coach_no, p_seats);
  SET v_coach_id = LAST_INSERT_ID();
  WHILE i <= p_seats DO
    INSERT INTO seats (coach_id, seat_number, berth_type)
    VALUES (v_coach_id, i, ELT(((i - 1) MOD 8) + 1,
            'LOWER','MIDDLE','UPPER','LOWER','MIDDLE','UPPER','SIDE_LOWER','SIDE_UPPER'));
    SET i = i + 1;
  END WHILE;
END$$

-- Search trains between two stations for a boarding date
CREATE PROCEDURE sp_search_trains(IN p_from VARCHAR(5), IN p_to VARCHAR(5), IN p_date DATE)
BEGIN
  SELECT r.run_id, t.train_number, t.train_name,
         a.departure_time AS departs, b.arrival_time AS arrives,
         (b.distance_km - a.distance_km) AS distance_km,
         c.class_code,
         ROUND((b.distance_km - a.distance_km) * c.rate_per_km, 2) AS fare,
         fn_available_seats(r.run_id, c.class_id, a.stop_seq, b.stop_seq) AS seats_available
    FROM stations sf
    JOIN train_stops a  ON a.station_id = sf.station_id
    JOIN stations st    ON st.station_code = p_to
    JOIN train_stops b  ON b.train_id = a.train_id AND b.station_id = st.station_id
                       AND b.stop_seq > a.stop_seq
    JOIN trains t       ON t.train_id = a.train_id AND t.is_active
    JOIN train_runs r   ON r.train_id = t.train_id
                       AND r.journey_date = DATE_SUB(p_date, INTERVAL a.day_offset DAY)
                       AND r.status = 'SCHEDULED'
    JOIN (SELECT DISTINCT train_id, class_id FROM train_coaches) tcl ON tcl.train_id = t.train_id
    JOIN coach_classes c ON c.class_id = tcl.class_id
   WHERE sf.station_code = p_from
   ORDER BY a.departure_time, c.class_id;
END$$

-- Book a ticket. p_passengers is a JSON array: [{"name":"..","age":24,"gender":"F"}, ...]
-- Whole booking is ONE transaction: run lock -> seat allocation / waitlist -> booking -> payment.
CREATE PROCEDURE sp_book_ticket(
  IN  p_user_id    INT,
  IN  p_run_id     INT,
  IN  p_from_code  VARCHAR(5),
  IN  p_to_code    VARCHAR(5),
  IN  p_class_code VARCHAR(3),
  IN  p_passengers JSON,
  IN  p_method     VARCHAR(12),
  OUT p_pnr        CHAR(10))
BEGIN
  DECLARE v_train_id   INT;
  DECLARE v_class_id   TINYINT UNSIGNED;
  DECLARE v_rate       DECIMAL(6,2);
  DECLARE v_from_st    INT;
  DECLARE v_to_st      INT;
  DECLARE v_from_seq   TINYINT UNSIGNED;
  DECLARE v_to_seq     TINYINT UNSIGNED;
  DECLARE v_from_km    INT;
  DECLARE v_to_km      INT;
  DECLARE v_fare       DECIMAL(10,2);
  DECLARE v_total      DECIMAL(10,2) DEFAULT 0;
  DECLARE v_booking_id INT;
  DECLARE v_seat_id    INT;
  DECLARE v_wl         INT;
  DECLARE v_n          INT;
  DECLARE i            INT DEFAULT 0;
  DECLARE v_name       VARCHAR(100);
  DECLARE v_age        INT;
  DECLARE v_gender     CHAR(1);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
  START TRANSACTION;

  -- Concurrency control: lock the run row FIRST. Two users booking the last seat
  -- are serialised here, so the second one sees the first one's committed seat.
  SELECT train_id INTO v_train_id
    FROM train_runs
   WHERE run_id = p_run_id AND status = 'SCHEDULED'
     FOR UPDATE;
  IF v_train_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Run not found or not open for booking';
  END IF;

  SELECT class_id, rate_per_km INTO v_class_id, v_rate
    FROM coach_classes WHERE class_code = p_class_code;
  IF v_class_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown class code';
  END IF;

  SELECT s.stop_seq, s.distance_km, s.station_id INTO v_from_seq, v_from_km, v_from_st
    FROM train_stops s JOIN stations st ON st.station_id = s.station_id
   WHERE s.train_id = v_train_id AND st.station_code = p_from_code;
  SELECT s.stop_seq, s.distance_km, s.station_id INTO v_to_seq, v_to_km, v_to_st
    FROM train_stops s JOIN stations st ON st.station_id = s.station_id
   WHERE s.train_id = v_train_id AND st.station_code = p_to_code;

  IF v_from_seq IS NULL OR v_to_seq IS NULL OR v_from_seq >= v_to_seq THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid origin/destination for this train';
  END IF;
  IF fn_departure(p_run_id, v_from_seq) <= NOW() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Train has already departed from the boarding station';
  END IF;

  SET v_n = JSON_LENGTH(p_passengers);
  IF v_n IS NULL OR v_n < 1 OR v_n > 6 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A booking needs 1 to 6 passengers';
  END IF;

  SET v_fare = ROUND((v_to_km - v_from_km) * v_rate, 2);

  INSERT INTO bookings (user_id, run_id, class_id, from_station_id, to_station_id, from_seq, to_seq)
  VALUES (p_user_id, p_run_id, v_class_id, v_from_st, v_to_st, v_from_seq, v_to_seq);
  SET v_booking_id = LAST_INSERT_ID();
  UPDATE bookings SET pnr = CONCAT('2', LPAD(v_booking_id, 9, '0')) WHERE booking_id = v_booking_id;

  WHILE i < v_n DO
    SET v_name   = JSON_UNQUOTE(JSON_EXTRACT(p_passengers, CONCAT('$[', i, '].name')));
    SET v_age    = CAST(JSON_UNQUOTE(JSON_EXTRACT(p_passengers, CONCAT('$[', i, '].age'))) AS UNSIGNED);
    SET v_gender = JSON_UNQUOTE(JSON_EXTRACT(p_passengers, CONCAT('$[', i, '].gender')));

    -- first free seat for this segment (passengers added earlier in this loop are already visible)
    SET v_seat_id = NULL;
    SELECT s.seat_id INTO v_seat_id
      FROM train_coaches tc
      JOIN seats s ON s.coach_id = tc.coach_id
     WHERE tc.train_id = v_train_id AND tc.class_id = v_class_id
       AND NOT EXISTS (SELECT 1
                         FROM passengers p
                         JOIN bookings b ON b.booking_id = p.booking_id
                        WHERE p.seat_id = s.seat_id AND p.status = 'CONFIRMED'
                          AND b.run_id = p_run_id
                          AND b.from_seq < v_to_seq AND b.to_seq > v_from_seq)
     ORDER BY tc.coach_number, s.seat_number
     LIMIT 1;

    IF v_seat_id IS NOT NULL THEN
      INSERT INTO passengers (booking_id, name, age, gender, seat_id, status, fare)
      VALUES (v_booking_id, v_name, v_age, v_gender, v_seat_id, 'CONFIRMED', v_fare);
    ELSE
      SELECT COALESCE(MAX(p.waitlist_no), 0) + 1 INTO v_wl
        FROM passengers p JOIN bookings b ON b.booking_id = p.booking_id
       WHERE b.run_id = p_run_id AND b.class_id = v_class_id AND p.status = 'WAITLISTED';
      INSERT INTO passengers (booking_id, name, age, gender, seat_id, status, waitlist_no, fare)
      VALUES (v_booking_id, v_name, v_age, v_gender, NULL, 'WAITLISTED', v_wl, v_fare);
    END IF;

    SET v_total = v_total + v_fare;
    SET i = i + 1;
  END WHILE;

  UPDATE bookings SET total_fare = v_total WHERE booking_id = v_booking_id;
  INSERT INTO payments (booking_id, txn_type, amount, method, txn_ref)
  VALUES (v_booking_id, 'PAYMENT', v_total, p_method, CONCAT('TXN', UUID_SHORT()));

  COMMIT;
  SELECT pnr INTO p_pnr FROM bookings WHERE booking_id = v_booking_id;
END$$

-- Promote waitlisted passengers (in waitlist order) into any seat that is free for their segment
CREATE PROCEDURE sp_promote_waitlist(IN p_run_id INT, IN p_class_id TINYINT UNSIGNED)
BEGIN
  DECLARE v_train INT;
  DECLARE v_pid   INT;
  DECLARE v_seat  INT;
  DECLARE v_go    TINYINT DEFAULT 1;

  SELECT train_id INTO v_train FROM train_runs WHERE run_id = p_run_id;

  WHILE v_go = 1 DO
    SET v_pid = NULL;
    SET v_seat = NULL;
    SELECT w.passenger_id, s.seat_id INTO v_pid, v_seat
      FROM passengers w
      JOIN bookings wb      ON wb.booking_id = w.booking_id
      JOIN train_coaches tc ON tc.train_id = v_train AND tc.class_id = p_class_id
      JOIN seats s          ON s.coach_id = tc.coach_id
     WHERE w.status = 'WAITLISTED' AND wb.run_id = p_run_id AND wb.class_id = p_class_id
       AND NOT EXISTS (SELECT 1
                         FROM passengers p
                         JOIN bookings b ON b.booking_id = p.booking_id
                        WHERE p.seat_id = s.seat_id AND p.status = 'CONFIRMED'
                          AND b.run_id = p_run_id
                          AND b.from_seq < wb.to_seq AND b.to_seq > wb.from_seq)
     ORDER BY w.waitlist_no, tc.coach_number, s.seat_number
     LIMIT 1;

    IF v_pid IS NULL THEN
      SET v_go = 0;
    ELSE
      UPDATE passengers
         SET status = 'CONFIRMED', seat_id = v_seat, waitlist_no = NULL
       WHERE passenger_id = v_pid;
    END IF;
  END WHILE;
END$$

-- Cancel one passenger. Refund slab by hours left before departure:
-- >=48h 90% | >=12h 75% | >=4h 50% | <4h 0%  (waitlisted tickets: 100%)
-- The waitlist promotion is fired by trigger trg_promote_waitlist (INSERT into cancellations).
CREATE PROCEDURE sp_cancel_passenger(IN p_passenger_id INT, OUT p_refund DECIMAL(10,2))
BEGIN
  DECLARE v_run      INT;
  DECLARE v_status   VARCHAR(12);
  DECLARE v_seat     INT;
  DECLARE v_fare     DECIMAL(10,2);
  DECLARE v_booking  INT;
  DECLARE v_from_seq TINYINT UNSIGNED;
  DECLARE v_method   VARCHAR(12);
  DECLARE v_hours    INT;
  DECLARE v_pct      DECIMAL(4,2);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
  START TRANSACTION;

  SELECT b.run_id INTO v_run
    FROM passengers p JOIN bookings b ON b.booking_id = p.booking_id
   WHERE p.passenger_id = p_passenger_id;
  IF v_run IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Passenger not found';
  END IF;

  -- same lock as booking: cancellations and bookings of one run never interleave
  SELECT run_id INTO v_run FROM train_runs WHERE run_id = v_run FOR UPDATE;

  SELECT p.status, p.seat_id, p.fare, p.booking_id, b.from_seq
    INTO v_status, v_seat, v_fare, v_booking, v_from_seq
    FROM passengers p JOIN bookings b ON b.booking_id = p.booking_id
   WHERE p.passenger_id = p_passenger_id;

  IF v_status = 'CANCELLED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Passenger ticket is already cancelled';
  END IF;

  SET v_hours = TIMESTAMPDIFF(HOUR, NOW(), fn_departure(v_run, v_from_seq));
  IF v_hours < 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Train has already departed';
  END IF;

  SET v_pct = CASE WHEN v_status = 'WAITLISTED' THEN 1.00
                   WHEN v_hours >= 48 THEN 0.90
                   WHEN v_hours >= 12 THEN 0.75
                   WHEN v_hours >= 4  THEN 0.50
                   ELSE 0 END;
  SET p_refund = ROUND(v_fare * v_pct, 2);

  UPDATE passengers
     SET status = 'CANCELLED', seat_id = NULL, waitlist_no = NULL
   WHERE passenger_id = p_passenger_id;

  -- fires trg_promote_waitlist
  INSERT INTO cancellations (passenger_id, freed_seat_id, refund_amount)
  VALUES (p_passenger_id, v_seat, p_refund);

  IF p_refund > 0 THEN
    SELECT method INTO v_method FROM payments
     WHERE booking_id = v_booking AND txn_type = 'PAYMENT' LIMIT 1;
    INSERT INTO payments (booking_id, txn_type, amount, method, txn_ref)
    VALUES (v_booking, 'REFUND', p_refund, v_method, CONCAT('RFD', UUID_SHORT()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM passengers WHERE booking_id = v_booking AND status <> 'CANCELLED') THEN
    UPDATE bookings SET status = 'CANCELLED' WHERE booking_id = v_booking;
  END IF;

  COMMIT;
END$$

-- =====================================================================
-- 4. TRIGGERS
-- =====================================================================

-- A trigger cannot update the table that fired it (passengers), so the promotion is
-- hooked on the separate 'cancellations' table.
CREATE TRIGGER trg_promote_waitlist
AFTER INSERT ON cancellations
FOR EACH ROW
BEGIN
  DECLARE v_run   INT;
  DECLARE v_class TINYINT UNSIGNED;
  IF NEW.freed_seat_id IS NOT NULL THEN
    SELECT b.run_id, b.class_id INTO v_run, v_class
      FROM passengers p JOIN bookings b ON b.booking_id = p.booking_id
     WHERE p.passenger_id = NEW.passenger_id;
    CALL sp_promote_waitlist(v_run, v_class);
  END IF;
END$$

-- Audit trail for fare-rate changes
CREATE TRIGGER trg_fare_audit
AFTER UPDATE ON coach_classes
FOR EACH ROW
BEGIN
  IF OLD.rate_per_km <> NEW.rate_per_km THEN
    INSERT INTO fare_audit (class_id, old_rate, new_rate, changed_by)
    VALUES (OLD.class_id, OLD.rate_per_km, NEW.rate_per_km, USER());
  END IF;
END$$

DELIMITER ;

-- =====================================================================
-- 5. VIEWS
-- =====================================================================

CREATE VIEW v_train_schedule AS
SELECT t.train_number, t.train_name, s.stop_seq, st.station_code, st.station_name,
       s.arrival_time, s.departure_time, s.day_offset, s.distance_km
  FROM trains t
  JOIN train_stops s ON s.train_id = t.train_id
  JOIN stations st   ON st.station_id = s.station_id;

-- PNR status: one row per passenger
CREATE VIEW v_booking_details AS
SELECT b.pnr, u.full_name AS booked_by, t.train_number, t.train_name, r.journey_date,
       sf.station_code AS from_code, stt.station_code AS to_code, cc.class_code,
       p.passenger_id, p.name AS passenger, p.age, p.status AS ticket_status,
       tc.coach_number, s.seat_number, s.berth_type, p.waitlist_no, p.fare
  FROM bookings b
  JOIN users u            ON u.user_id = b.user_id
  JOIN train_runs r       ON r.run_id = b.run_id
  JOIN trains t           ON t.train_id = r.train_id
  JOIN stations sf        ON sf.station_id = b.from_station_id
  JOIN stations stt       ON stt.station_id = b.to_station_id
  JOIN coach_classes cc   ON cc.class_id = b.class_id
  JOIN passengers p       ON p.booking_id = b.booking_id
  LEFT JOIN seats s       ON s.seat_id = p.seat_id
  LEFT JOIN train_coaches tc ON tc.coach_id = s.coach_id;

-- Net revenue (payments minus refunds) per train
CREATE VIEW v_revenue_by_train AS
SELECT t.train_number, t.train_name,
       COUNT(DISTINCT b.booking_id) AS total_bookings,
       SUM(CASE WHEN p.txn_type = 'PAYMENT' THEN p.amount ELSE -p.amount END) AS net_revenue
  FROM payments p
  JOIN bookings b   ON b.booking_id = p.booking_id
  JOIN train_runs r ON r.run_id = b.run_id
  JOIN trains t     ON t.train_id = r.train_id
 WHERE p.status = 'SUCCESS'
 GROUP BY t.train_id, t.train_number, t.train_name;

-- =====================================================================
-- 6. SAMPLE DATA  (fictional trains; distances/timings are approximate)
-- =====================================================================

INSERT INTO users (full_name, email, phone, password_hash, role) VALUES
 ('Admin User',   'admin@rail.local', '9000000001', '$2b$10$replace_with_real_bcrypt_hash', 'ADMIN'),
 ('Riya Sharma',  'riya@mail.com',    '9000000002', '$2b$10$replace_with_real_bcrypt_hash', 'PASSENGER'),
 ('Aman Verma',   'aman@mail.com',    '9000000003', '$2b$10$replace_with_real_bcrypt_hash', 'PASSENGER'),
 ('Neha Singh',   'neha@mail.com',    '9000000004', '$2b$10$replace_with_real_bcrypt_hash', 'PASSENGER');

INSERT INTO stations (station_id, station_code, station_name, city, state) VALUES
 (1,'NDLS','New Delhi',     'Delhi',   'Delhi'),
 (2,'AGC', 'Agra Cantt',    'Agra',    'Uttar Pradesh'),
 (3,'GWL', 'Gwalior Jn',    'Gwalior', 'Madhya Pradesh'),
 (4,'JHS', 'Jhansi Jn',     'Jhansi',  'Uttar Pradesh'),
 (5,'BPL', 'Bhopal Jn',     'Bhopal',  'Madhya Pradesh'),
 (6,'NGP', 'Nagpur Jn',     'Nagpur',  'Maharashtra');

INSERT INTO trains (train_id, train_number, train_name, train_type) VALUES
 (1,'12951','Delhi-Bhopal Express',  'SUPERFAST'),
 (2,'12616','Delhi-Nagpur Express',  'EXPRESS');

INSERT INTO train_stops (train_id, stop_seq, station_id, arrival_time, departure_time, day_offset, distance_km) VALUES
 (1,1,1,NULL,      '06:00',0,   0),
 (1,2,2,'08:30',   '08:35',0, 195),
 (1,3,3,'10:00',   '10:05',0, 313),
 (1,4,4,'11:50',   '11:55',0, 403),
 (1,5,5,'16:30',   NULL,   0, 701),
 (2,1,1,NULL,      '22:00',0,   0),
 (2,2,2,'00:45',   '00:50',1, 195),
 (2,3,4,'04:10',   '04:15',1, 403),
 (2,4,5,'08:30',   '08:40',1, 701),
 (2,5,6,'14:30',   NULL,   1,1090);

INSERT INTO coach_classes (class_id, class_code, class_name, rate_per_km) VALUES
 (1,'SL','Sleeper',        0.60),
 (2,'3A','AC 3 Tier',      1.60),
 (3,'2A','AC 2 Tier',      2.30),
 (4,'1A','AC First Class', 3.80);

-- Small coaches on purpose, so the waitlist is easy to demonstrate
CALL sp_add_coach(1, 1, 'S1', 4);
CALL sp_add_coach(1, 2, 'B1', 6);
CALL sp_add_coach(1, 3, 'A1', 4);
CALL sp_add_coach(2, 1, 'S1', 6);
CALL sp_add_coach(2, 2, 'B1', 6);
CALL sp_add_coach(2, 3, 'A1', 4);
CALL sp_add_coach(2, 4, 'H1', 2);

-- Runs for the next 7 days for every train
INSERT INTO train_runs (train_id, journey_date)
SELECT t.train_id, CURDATE() + INTERVAL d.n DAY
  FROM trains t
  JOIN (SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
        UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7) d;

-- =====================================================================
-- 7. DEMO / TEST SCRIPT  (run block by block)
-- =====================================================================

-- 7.1 Search
CALL sp_search_trains('NDLS', 'BPL', CURDATE() + INTERVAL 3 DAY);

-- 7.2 Book: Train 1, SL has only 4 seats. 3 + 2 passengers => 4 CONFIRMED, 1 WAITLISTED
SET @run := (SELECT run_id FROM train_runs WHERE train_id = 1 AND journey_date = CURDATE() + INTERVAL 3 DAY);

CALL sp_book_ticket(2, @run, 'NDLS', 'BPL', 'SL',
  '[{"name":"Riya Sharma","age":24,"gender":"F"},{"name":"Aman Sharma","age":27,"gender":"M"},{"name":"Kabir Sharma","age":22,"gender":"M"}]',
  'UPI', @pnr1);
CALL sp_book_ticket(3, @run, 'NDLS', 'BPL', 'SL',
  '[{"name":"Aman Verma","age":30,"gender":"M"},{"name":"Pooja Verma","age":28,"gender":"F"}]',
  'CARD', @pnr2);

SELECT @pnr1 AS pnr_1, @pnr2 AS pnr_2;
SELECT * FROM v_booking_details WHERE pnr IN (@pnr1, @pnr2) ORDER BY pnr, passenger_id;

-- 7.3 Segment reuse: a seat used NDLS->AGC can still be sold AGC->BPL (A1 class, 4 seats)
-- (try booking 4 passengers NDLS->AGC and 4 passengers AGC->BPL in '2A' - all will be CONFIRMED)

-- 7.4 Cancel the first passenger of booking 1 -> trigger promotes the waitlisted passenger
SET @pid := (SELECT p.passenger_id FROM passengers p JOIN bookings b ON b.booking_id = p.booking_id
              WHERE b.pnr = @pnr1 ORDER BY p.passenger_id LIMIT 1);
CALL sp_cancel_passenger(@pid, @refund);
SELECT @refund AS refund_amount;
SELECT * FROM v_booking_details WHERE pnr IN (@pnr1, @pnr2) ORDER BY pnr, passenger_id;

-- 7.5 Fare audit trigger
UPDATE coach_classes SET rate_per_km = 0.65 WHERE class_code = 'SL';
SELECT * FROM fare_audit;

-- 7.6 Reports
SELECT * FROM v_revenue_by_train;
SELECT cc.class_code, COUNT(*) AS cancelled_tickets, SUM(c.refund_amount) AS refunded
  FROM cancellations c
  JOIN passengers p     ON p.passenger_id = c.passenger_id
  JOIN bookings b       ON b.booking_id = p.booking_id
  JOIN coach_classes cc ON cc.class_id = b.class_id
 GROUP BY cc.class_code;

-- 7.7 Index demo for your report: compare plans, then re-create the index
EXPLAIN SELECT * FROM train_stops WHERE station_id = 1;
-- DROP INDEX idx_stops_station ON train_stops;  -- run EXPLAIN again, then re-create it

-- 7.8 Concurrency demo (two Workbench query tabs, same run, last free seat):
--   Tab A:  CALL sp_book_ticket(2, @run, 'NDLS','AGC','1A', '[{"name":"X","age":30,"gender":"M"}]', 'UPI', @a);
--   Tab B:  CALL sp_book_ticket(3, @run, 'NDLS','AGC','1A', '[{"name":"Y","age":31,"gender":"M"}]', 'UPI', @b);
--   Run both at the same moment (train 1 has no 1A coach; use train 2 + class '1A', 2 seats).
--   Result: no seat is ever double-allocated, extra passengers go to the waitlist.
