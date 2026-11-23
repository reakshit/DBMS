require('../src/config');
const pool = require('../src/db');

const createPaymentOrders = `
  CREATE TABLE IF NOT EXISTS payment_orders (
    razorpay_order_id  VARCHAR(40) PRIMARY KEY,
    local_order_id     CHAR(36) NOT NULL UNIQUE,
    user_id            INT NOT NULL,
    amount_paise       INT UNSIGNED NOT NULL,
    request_json       JSON NOT NULL,
    status             ENUM('CREATED','BOOKED','REFUNDED','REFUND_PENDING','REFUND_REQUIRED') NOT NULL DEFAULT 'CREATED',
    razorpay_payment_id VARCHAR(40) NULL UNIQUE,
    provider_refund_id VARCHAR(40) NULL,
    booking_id         INT NULL,
    failure_reason     VARCHAR(255) NULL,
    created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_payment_order_user FOREIGN KEY (user_id) REFERENCES users(user_id),
    CONSTRAINT fk_payment_order_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id),
    CONSTRAINT chk_payment_order_amount CHECK (amount_paise > 0),
    UNIQUE KEY uq_payment_order_booking (booking_id)
  ) ENGINE=InnoDB
`;

const createDemoBookingProcedure = `
CREATE PROCEDURE sp_book_ticket_demo(
  IN  p_user_id         INT,
  IN  p_run_id          INT,
  IN  p_from_code       VARCHAR(5),
  IN  p_to_code         VARCHAR(5),
  IN  p_class_code      VARCHAR(3),
  IN  p_passengers      JSON,
  IN  p_demo_order      VARCHAR(40),
  IN  p_demo_payment   VARCHAR(40),
  OUT p_pnr             CHAR(10))
BEGIN
  DECLARE v_train_id    INT;
  DECLARE v_class_id    TINYINT UNSIGNED;
  DECLARE v_rate        DECIMAL(6,2);
  DECLARE v_from_st     INT;
  DECLARE v_to_st       INT;
  DECLARE v_from_seq    TINYINT UNSIGNED;
  DECLARE v_to_seq      TINYINT UNSIGNED;
  DECLARE v_from_km     INT;
  DECLARE v_to_km       INT;
  DECLARE v_fare        DECIMAL(10,2);
  DECLARE v_total       DECIMAL(10,2) DEFAULT 0;
  DECLARE v_booking_id  INT;
  DECLARE v_seat_id     INT;
  DECLARE v_wl          INT;
  DECLARE v_n           INT;
  DECLARE v_order_user  INT;
  DECLARE v_order_amount INT;
  DECLARE v_order_status VARCHAR(20);
  DECLARE i             INT DEFAULT 0;
  DECLARE v_name        VARCHAR(100);
  DECLARE v_age         INT;
  DECLARE v_gender      CHAR(1);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
  START TRANSACTION;

  SELECT user_id, amount_paise, status
    INTO v_order_user, v_order_amount, v_order_status
    FROM payment_orders
   WHERE razorpay_order_id = p_demo_order
     FOR UPDATE;
  IF v_order_user <> p_user_id OR v_order_status <> 'CREATED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment order is not available for this user';
  END IF;

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
  SET v_total = v_fare * v_n;
  IF v_order_amount <> ROUND(v_total * 100) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment amount does not match the booking fare';
  END IF;
  SET v_total = 0;

  INSERT INTO bookings (user_id, run_id, class_id, from_station_id, to_station_id, from_seq, to_seq)
  VALUES (p_user_id, p_run_id, v_class_id, v_from_st, v_to_st, v_from_seq, v_to_seq);
  SET v_booking_id = LAST_INSERT_ID();
  UPDATE bookings SET pnr = CONCAT('2', LPAD(v_booking_id, 9, '0')) WHERE booking_id = v_booking_id;

  WHILE i < v_n DO
    SET v_name = JSON_UNQUOTE(JSON_EXTRACT(p_passengers, CONCAT('$[', i, '].name')));
    SET v_age = CAST(JSON_UNQUOTE(JSON_EXTRACT(p_passengers, CONCAT('$[', i, '].age'))) AS UNSIGNED);
    SET v_gender = JSON_UNQUOTE(JSON_EXTRACT(p_passengers, CONCAT('$[', i, '].gender')));
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
  INSERT INTO payments (booking_id, txn_type, amount, method, status, txn_ref)
  VALUES (v_booking_id, 'PAYMENT', v_total, 'UPI', 'SUCCESS', p_demo_payment);
  UPDATE payment_orders
     SET status = 'BOOKED', razorpay_payment_id = p_demo_payment, booking_id = v_booking_id
   WHERE razorpay_order_id = p_demo_order;

  COMMIT;
  SELECT pnr INTO p_pnr FROM bookings WHERE booking_id = v_booking_id;
END
`;

(async () => {
  const conn = await pool.getConnection();
  try {
    await conn.query(createPaymentOrders);
    await conn.query('DROP PROCEDURE IF EXISTS sp_book_ticket_razorpay');
    await conn.query('DROP PROCEDURE IF EXISTS sp_book_ticket_demo');
    await conn.query(createDemoBookingProcedure);
    console.log('Demo payment-order table and booking procedure are ready.');
  } finally {
    conn.release();
    await pool.end();
  }
})().catch((error) => {
  console.error('Demo payment migration failed:', error.sqlMessage || error.message);
  process.exit(1);
});
