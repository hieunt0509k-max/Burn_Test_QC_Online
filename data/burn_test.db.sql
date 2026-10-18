BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS "app_settings" (
	"key"	TEXT,
	"value"	TEXT,
	"updated_at"	TEXT NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY("key")
);
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id"	INTEGER,
	"action"	TEXT NOT NULL,
	"detail"	TEXT,
	"created_at"	TEXT NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "burn_test_logs" (
	"id"	INTEGER,
	"burn_test_id"	INTEGER NOT NULL,
	"time_label"	TEXT NOT NULL,
	"wick_status"	TEXT NOT NULL,
	"flame_status"	TEXT NOT NULL,
	"wick_height_mm"	REAL NOT NULL,
	"vessel_condition"	TEXT NOT NULL,
	"temperature_c"	REAL NOT NULL,
	"note"	TEXT,
	"created_at"	TEXT NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("burn_test_id") REFERENCES "burn_tests"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "burn_test_photos" (
	"id"	INTEGER,
	"burn_test_id"	INTEGER NOT NULL,
	"slot"	INTEGER NOT NULL,
	"file_name"	TEXT NOT NULL,
	"file_url"	TEXT NOT NULL,
	"original_name"	TEXT,
	"mime_type"	TEXT,
	"file_size"	INTEGER,
	"created_at"	TEXT NOT NULL DEFAULT (datetime('now')),
	UNIQUE("burn_test_id","slot"),
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("burn_test_id") REFERENCES "burn_tests"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "burn_tests" (
	"id"	INTEGER,
	"purchase_order_id"	INTEGER NOT NULL,
	"product_code"	TEXT NOT NULL,
	"diameter_mm"	REAL,
	"height_mm"	REAL,
	"fragrance"	TEXT,
	"color"	TEXT,
	"wick"	TEXT,
	"temperature_c"	REAL,
	"test_date"	TEXT,
	"test_time"	TEXT,
	"start_datetime"	TEXT,
	"end_datetime"	TEXT,
	"total_burn_time"	TEXT,
	"tester"	TEXT,
	"approver"	TEXT,
	"result"	TEXT NOT NULL DEFAULT 'PENDING',
	"note"	TEXT,
	"created_at"	TEXT NOT NULL DEFAULT (datetime('now')),
	"updated_at"	TEXT NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS "customers" (
	"id"	INTEGER,
	"name"	TEXT NOT NULL UNIQUE,
	"created_at"	TEXT NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "periodic_check_items" (
	"id"	INTEGER,
	"check_id"	INTEGER NOT NULL,
	"item_name"	TEXT NOT NULL,
	"standard"	TEXT,
	"actual"	TEXT,
	"result"	TEXT NOT NULL DEFAULT 'PASS',
	"root_cause"	TEXT,
	"corrective_action"	TEXT,
	"owner"	TEXT,
	"deadline"	TEXT,
	"status"	TEXT NOT NULL DEFAULT 'Closed',
	"note"	TEXT,
	"created_at"	TEXT NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("check_id") REFERENCES "periodic_checks"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "periodic_checks" (
	"id"	INTEGER,
	"check_date"	TEXT NOT NULL,
	"check_time"	TEXT,
	"area"	TEXT,
	"process"	TEXT,
	"shift"	TEXT,
	"inspector"	TEXT,
	"check_type"	TEXT,
	"template_id"	INTEGER,
	"overall_result"	TEXT NOT NULL DEFAULT 'PASS',
	"note"	TEXT,
	"created_at"	TEXT NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("template_id") REFERENCES "periodic_templates"("id") ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS "periodic_template_items" (
	"id"	INTEGER,
	"template_id"	INTEGER NOT NULL,
	"item_name"	TEXT NOT NULL,
	"standard"	TEXT,
	"sort_order"	INTEGER NOT NULL DEFAULT 0,
	"created_at"	TEXT NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("template_id") REFERENCES "periodic_templates"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "periodic_templates" (
	"id"	INTEGER,
	"name"	TEXT NOT NULL UNIQUE,
	"description"	TEXT,
	"active"	INTEGER NOT NULL DEFAULT 1,
	"created_at"	TEXT NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "products" (
	"id"	INTEGER,
	"order_id"	INTEGER NOT NULL,
	"product_code"	TEXT NOT NULL,
	"size"	TEXT,
	"weight"	REAL,
	"wick"	TEXT,
	"color"	TEXT,
	"fragrance"	TEXT,
	"diameter_mm"	REAL,
	"height_mm"	REAL,
	"notes"	TEXT,
	"created_at"	TEXT NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "purchase_orders" (
	"id"	INTEGER,
	"customer_id"	INTEGER NOT NULL,
	"po_number"	TEXT NOT NULL,
	"created_at"	TEXT NOT NULL DEFAULT (datetime('now')),
	UNIQUE("customer_id","po_number"),
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS "qc_standards" (
	"id"	INTEGER,
	"name"	TEXT NOT NULL,
	"criterion"	TEXT NOT NULL,
	"min_value"	TEXT,
	"max_value"	TEXT,
	"unit"	TEXT,
	"active"	INTEGER NOT NULL DEFAULT 1,
	"note"	TEXT,
	"created_at"	TEXT NOT NULL DEFAULT (datetime('now')),
	"updated_at"	TEXT NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY("id" AUTOINCREMENT)
);
INSERT INTO "app_settings" VALUES ('company','CÔNG TY TNHH SẢN PHẨM ISUN VIỆT NAM','2026-09-05 06:33:02');
INSERT INTO "app_settings" VALUES ('factory','','2026-09-05 06:33:02');
INSERT INTO "app_settings" VALUES ('address','Thôn Ngọc Lãng, Phường Đường Hào, Tỉnh Hưng Yên','2026-09-05 06:33:02');
INSERT INTO "app_settings" VALUES ('email','qc1@icolorbiotech.com','2026-09-05 06:33:02');
INSERT INTO "app_settings" VALUES ('phone','','2026-09-05 06:33:02');
INSERT INTO "app_settings" VALUES ('qc_manager','Dương Văn Quyết','2026-09-05 06:33:02');
INSERT INTO "app_settings" VALUES ('burn_duration','','2026-09-05 06:33:02');
INSERT INTO "app_settings" VALUES ('log_interval','','2026-09-05 06:33:02');
INSERT INTO "app_settings" VALUES ('weight_unit','g','2026-09-05 06:33:02');
INSERT INTO "app_settings" VALUES ('temp_unit','°C','2026-09-05 06:33:02');
INSERT INTO "app_settings" VALUES ('flame_unit','mm','2026-09-05 06:33:02');
INSERT INTO "app_settings" VALUES ('photo_max','','2026-09-05 06:33:02');
INSERT INTO "app_settings" VALUES ('upload_dir','','2026-09-05 06:33:02');
INSERT INTO "app_settings" VALUES ('photo_width','','2026-09-05 06:33:02');
INSERT INTO "app_settings" VALUES ('photo_quality','','2026-09-05 06:33:02');
INSERT INTO "app_settings" VALUES ('photo_compress','1','2026-09-05 06:33:02');
INSERT INTO "app_settings" VALUES ('report_photos','1','2026-09-05 06:33:02');
INSERT INTO "app_settings" VALUES ('report_title','BURN TEST QC REPORT','2026-09-05 06:33:02');
INSERT INTO "app_settings" VALUES ('report_footer','','2026-09-05 06:33:02');
INSERT INTO "app_settings" VALUES ('report_prepared','Nguyễn Trung Hiếu','2026-09-05 06:33:02');
INSERT INTO "app_settings" VALUES ('report_approved','Dương Văn Quyết','2026-09-05 06:33:02');
INSERT INTO "app_settings" VALUES ('report_chart','1','2026-09-05 06:33:02');
INSERT INTO "app_settings" VALUES ('report_signature','1','2026-09-05 06:33:02');
INSERT INTO "app_settings" VALUES ('report_logo_path','D:\HIEU\App_InLine\ui_upgrade\uploads\system\report-logo.jpg','2026-09-05 04:28:58');
INSERT INTO "audit_logs" VALUES (1,'BACKUP','D:\HIEU\App_InLine\ui_upgrade\backups\2026-09-05_10-42-35','2026-09-05 03:42:35');
INSERT INTO "audit_logs" VALUES (2,'SETTINGS_UPDATE','company, factory, address, email, phone, qc_manager, burn_duration, log_interval, weight_unit, temp_unit, flame_unit, photo_max, upload_dir, photo_width, photo_quality, photo_compress, report_photos, report_title, report_footer, report_prepared, report_approved, report_chart, report_signature','2026-09-05 03:48:52');
INSERT INTO "audit_logs" VALUES (3,'SETTINGS_UPDATE','company, factory, address, email, phone, qc_manager, burn_duration, log_interval, weight_unit, temp_unit, flame_unit, photo_max, upload_dir, photo_width, photo_quality, photo_compress, report_photos, report_title, report_footer, report_prepared, report_approved, report_chart, report_signature','2026-09-05 03:52:37');
INSERT INTO "audit_logs" VALUES (4,'STANDARD_CREATE','EN 15493 / Flame hight','2026-09-05 03:57:19');
INSERT INTO "audit_logs" VALUES (5,'STANDARD_CREATE','EN 15493 / After-smoke','2026-09-05 03:58:33');
INSERT INTO "audit_logs" VALUES (6,'SETTINGS_UPDATE','company, factory, address, email, phone, qc_manager, burn_duration, log_interval, weight_unit, temp_unit, flame_unit, photo_max, upload_dir, photo_width, photo_quality, photo_compress, report_photos, report_title, report_footer, report_prepared, report_approved, report_chart, report_signature','2026-09-05 04:00:50');
INSERT INTO "audit_logs" VALUES (7,'SETTINGS_UPDATE','company, factory, address, email, phone, qc_manager, burn_duration, log_interval, weight_unit, temp_unit, flame_unit, photo_max, upload_dir, photo_width, photo_quality, photo_compress, report_photos, report_title, report_footer, report_prepared, report_approved, report_chart, report_signature','2026-09-05 04:28:50');
INSERT INTO "audit_logs" VALUES (8,'REPORT_LOGO_UPDATE','D:\HIEU\App_InLine\ui_upgrade\uploads\system\report-logo.jpg','2026-09-05 04:28:58');
INSERT INTO "audit_logs" VALUES (9,'SETTINGS_UPDATE','company, factory, address, email, phone, qc_manager, burn_duration, log_interval, weight_unit, temp_unit, flame_unit, photo_max, upload_dir, photo_width, photo_quality, photo_compress, report_photos, report_title, report_footer, report_prepared, report_approved, report_chart, report_signature','2026-09-05 04:56:34');
INSERT INTO "audit_logs" VALUES (10,'SETTINGS_UPDATE','company, factory, address, email, phone, qc_manager, burn_duration, log_interval, weight_unit, temp_unit, flame_unit, photo_max, upload_dir, photo_width, photo_quality, photo_compress, report_photos, report_title, report_footer, report_prepared, report_approved, report_chart, report_signature','2026-09-05 06:33:02');
INSERT INTO "burn_test_logs" VALUES (3,10,'2H','A','A',20.0,'A',0.0,NULL,'2026-09-05 03:46:26');
INSERT INTO "burn_test_logs" VALUES (4,9,'2H','A','A',21.0,'A',0.0,NULL,'2026-09-05 03:46:46');
INSERT INTO "burn_test_photos" VALUES (7,8,1,'YN26-0188/40056H/burn-test-1.jpg','/uploads/YN26-0188/40056H/burn-test-1.jpg','a5d99aa09f36c8cf465425340a4279ee.jpg','image/jpeg',108987,'2026-09-04 06:11:52');
INSERT INTO "burn_test_photos" VALUES (8,7,2,'YN26-0188/40056J/burn-test-2.jpg','/uploads/YN26-0188/40056J/burn-test-2.jpg','10917b75733eae15601a91c5088320b6.jpg','image/jpeg',140702,'2026-09-04 06:11:59');
INSERT INTO "burn_test_photos" VALUES (9,6,2,'YN26-0188/40076Q/burn-test-2.jpg','/uploads/YN26-0188/40076Q/burn-test-2.jpg','055b675e9662e64760259bef12e11a9f.jpg','image/jpeg',114834,'2026-09-04 06:12:07');
INSERT INTO "burn_test_photos" VALUES (10,7,1,'YN26-0188/40056J/burn-test-1.jpg','/uploads/YN26-0188/40056J/burn-test-1.jpg','fdbf37df5f5f719ae1475e527706475c.jpg','image/jpeg',131743,'2026-09-04 06:12:22');
INSERT INTO "burn_test_photos" VALUES (11,6,1,'YN26-0188/40076Q/burn-test-1.jpg','/uploads/YN26-0188/40076Q/burn-test-1.jpg','92cc101609ca5e4af3c6486dcdf6bc06.jpg','image/jpeg',113654,'2026-09-04 06:12:32');
INSERT INTO "burn_test_photos" VALUES (12,8,2,'YN26-0188/40056H/burn-test-2.jpg','/uploads/YN26-0188/40056H/burn-test-2.jpg','test-1788507474823.jpg','image/jpeg',243348,'2026-09-04 07:37:54');
INSERT INTO "burn_test_photos" VALUES (13,9,1,'YN26-0171/22468M/burn-test-1.jpg','/uploads/YN26-0171/22468M/burn-test-1.jpg','test-1788578870851.jpg','image/jpeg',341827,'2026-09-05 03:27:50');
INSERT INTO "burn_test_photos" VALUES (14,10,1,'YN26-0171/22468L/burn-test-1.jpg','/uploads/YN26-0171/22468L/burn-test-1.jpg','test-1788578902286.jpg','image/jpeg',327031,'2026-09-05 03:28:21');
INSERT INTO "burn_test_photos" VALUES (15,6,3,'YN26-0188/40076Q/burn-test-3.jpg','/uploads/YN26-0188/40076Q/burn-test-3.jpg','test-1788583291599.jpg','image/jpeg',273167,'2026-09-05 04:41:31');
INSERT INTO "burn_test_photos" VALUES (16,7,3,'YN26-0188/40056J/burn-test-3.jpg','/uploads/YN26-0188/40056J/burn-test-3.jpg','test-1788583315940.jpg','image/jpeg',284932,'2026-09-05 04:41:55');
INSERT INTO "burn_test_photos" VALUES (17,11,1,'YN26-0223-0224-0225/3x4/burn-test-1.jpg','/uploads/YN26-0223-0224-0225/3x4/burn-test-1.jpg','test-1788589154208.jpg','image/jpeg',291298,'2026-09-05 06:19:13');
INSERT INTO "burn_test_photos" VALUES (18,8,3,'YN26-0188/40056H/burn-test-3.jpg','/uploads/YN26-0188/40056H/burn-test-3.jpg','test-1788595500658.jpg','image/jpeg',248772,'2026-09-05 08:05:00');
INSERT INTO "burn_test_photos" VALUES (19,9,2,'YN26-0171/22468M/burn-test-2.jpg','/uploads/YN26-0171/22468M/burn-test-2.jpg','test-1788595896741.jpg','image/jpeg',313113,'2026-09-05 08:11:36');
INSERT INTO "burn_test_photos" VALUES (20,10,2,'YN26-0171/22468L/burn-test-2.jpg','/uploads/YN26-0171/22468L/burn-test-2.jpg','test-1788595932680.jpg','image/jpeg',309345,'2026-09-05 08:12:12');
INSERT INTO "burn_test_photos" VALUES (21,11,2,'YN26-0223-0224-0225/3x4/burn-test-2.jpg','/uploads/YN26-0223-0224-0225/3x4/burn-test-2.jpg','test-1788600366716.jpg','image/jpeg',247677,'2026-09-05 09:26:06');
INSERT INTO "burn_tests" VALUES (6,8,'40076Q',70.0,85.0,'UAP00062/00 Blushing Petals','粉色 706C','T24',NULL,'2026-09-03','08:00','2026-09-03T08:00',NULL,NULL,NULL,NULL,'PENDING',NULL,'2026-09-04 05:46:06','2026-09-05 04:41:31');
INSERT INTO "burn_tests" VALUES (7,8,'40056J',80.0,90.0,'UAP00062/00 Hugs & Roses','231C','T27',NULL,'2026-09-03','08:00','2026-09-03T08:00',NULL,NULL,NULL,NULL,'PENDING',NULL,'2026-09-04 05:46:57','2026-09-05 04:41:55');
INSERT INTO "burn_tests" VALUES (8,8,'40056H',80.0,90.0,'UAP00058/00 Cupid’s Cream','217C','T27',NULL,'2026-09-04','08:00','2026-09-04T08:00',NULL,NULL,NULL,NULL,'PENDING',NULL,'2026-09-04 05:47:08','2026-09-05 08:05:00');
INSERT INTO "burn_tests" VALUES (9,10,'22468M',100.0,145.0,'307242','White','T24',NULL,'2026-09-05','10:24','2026-09-05T10:24',NULL,NULL,NULL,NULL,'PENDING',NULL,'2026-09-05 03:27:08','2026-09-05 08:11:36');
INSERT INTO "burn_tests" VALUES (10,10,'22468L',100.0,145.0,'CB23-20983','White','T24',NULL,'2026-09-05','10:27','2026-09-05T10:27',NULL,NULL,NULL,NULL,'PENDING',NULL,'2026-09-05 03:27:30','2026-09-05 08:12:12');
INSERT INTO "burn_tests" VALUES (11,11,'3x4',76.0,102.0,'/','White','QT32',24.0,'2026-09-05','13:17','2026-09-05T13:17',NULL,NULL,NULL,NULL,'PENDING',NULL,'2026-09-05 06:18:52','2026-09-05 09:26:06');
INSERT INTO "customers" VALUES (2,'CBE','2026-08-29 06:25:07');
INSERT INTO "customers" VALUES (3,'1616 HOLDINGS INC.','2026-08-31 01:30:13');
INSERT INTO "customers" VALUES (4,'Orly','2026-08-31 02:03:33');
INSERT INTO "customers" VALUES (5,'1800 Flowers','2026-09-04 07:30:28');
INSERT INTO "customers" VALUES (6,'CKK','2026-09-05 06:16:15');
INSERT INTO "customers" VALUES (7,'Dollar Tree','2026-09-05 07:46:58');
INSERT INTO "periodic_check_items" VALUES (4,4,'Nhiệt độ phòng đốt','15-25','24','PASS',NULL,NULL,NULL,'2026-09-05','Closed',NULL,'2026-09-05 07:16:32');
INSERT INTO "periodic_checks" VALUES (4,'2026-09-05','08:01','Phòng Test đốt','Test Đốt','Ca 1','Hiếu','Nhiệt độ',2,'PASS',NULL,'2026-09-05 07:16:32');
INSERT INTO "periodic_template_items" VALUES (1,1,'12','12',0,'2026-09-05 07:12:14');
INSERT INTO "periodic_template_items" VALUES (2,2,'Nhiệt độ phòng đốt','15-25',0,'2026-09-05 07:14:45');
INSERT INTO "periodic_templates" VALUES (1,'12','12',1,'2026-09-05 07:12:14');
INSERT INTO "periodic_templates" VALUES (2,'Phòng Test Đốt','ghi nhiệt độ phồng',1,'2026-09-05 07:14:45');
INSERT INTO "products" VALUES (88,5,'22025H','D11xH8cm',340.0,'T21','白色 White','YS307244 Teakwood',110.0,80.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (89,5,'22025J','D11xH8cm',340.0,'T21','白色 White','287939 One Fine Pine',110.0,80.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (90,5,'22025K','D11xH8cm',340.0,'T21','白色 White','327244 Chai latte',110.0,80.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (91,5,'22025L','D11xH8cm',340.0,'T21','白色 White','DP1876 Coconut Cove',110.0,80.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (92,5,'22025M','D11xH8cm',340.0,'T21','白色 White','327245 Crisp apple',110.0,80.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (93,5,'22025N','D11xH8cm',340.0,'T21','白色 White','327249A flesh cut eucalyptus',110.0,80.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (94,5,'22025P','D11xH8cm',340.0,'T21','白色 White','325587 Lavender dreams',110.0,80.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (95,5,'22025Q','D11xH8cm',340.0,'T21','白色 White','CB23-20983 Lush Wildflowers',110.0,80.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (96,5,'22025T','D11xH8cm',340.0,'T21','白色 White','CA-LAC2714 Pink Amber',110.0,80.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (97,5,'22025V','D11xH8cm',340.0,'T21','白色 White','DP1880 Vanilla Bean',110.0,80.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (98,5,'22468D','D10xH14.5cm',538.0,'T24','白色 White','YS307244 Teakwood',100.0,145.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (99,5,'22468E','D10xH14.5cm',538.0,'T24','白色 White','287939 One Fine Pine',100.0,145.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (100,5,'22468G','D10xH14.5cm',538.0,'T24','白色 White','DP1876 Coconut Cove',100.0,145.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (101,5,'22468H','D10xH14.5cm',538.0,'T24','白色 White','327245 Crisp apple',100.0,145.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (102,5,'22468J','D10xH14.5cm',538.0,'T24','白色 White','327249A flesh cut eucalyptus',100.0,145.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (103,5,'22468K','D10xH14.5cm',538.0,'T24','白色 White','325587 Lavender dreams',100.0,145.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (104,5,'22468L','D10xH14.5cm',538.0,'T24','白色 White','CB23-20983 Lush Wildflowers',100.0,145.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (105,5,'22468M','D10xH14.5cm',538.0,'T24','白色 White','307242 Citrus',100.0,145.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (106,5,'22468N','D10xH14.5cm',538.0,'T24','白色 White','CA-LAC2714 Pink Amber',100.0,145.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (107,5,'22468P','D10xH14.5cm',538.0,'T24','白色 White','307245 Summer Rain',100.0,145.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (108,5,'22468Q','D10xH14.5cm',538.0,'T24','白色 White','DP1880 Vanilla Bean',100.0,145.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (109,5,'22488A','D8xH10.5cm',226.0,'T27','白色 White','YS307244 Teakwood',80.0,105.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (110,5,'22488B','D8xH10.5cm',226.0,'T27','白色 White','287939 One Fine Pine',80.0,105.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (111,5,'22488C','D8xH10.5cm',226.0,'T27','白色 White','327244 Chai latte',80.0,105.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (112,5,'22488D','D8xH10.5cm',226.0,'T27','白色 White','DP1876 Coconut Cove',80.0,105.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (113,5,'22488E','D8xH10.5cm',226.0,'T27','白色 White','327245 Crisp apple',80.0,105.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (114,5,'22488F','D8xH10.5cm',226.0,'T27','白色 White','327246 Fresh cut eucalyptus',80.0,105.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (115,5,'22488G','D8xH10.5cm',226.0,'T27','白色 White','325587 Lavender dreams',80.0,105.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (116,5,'22488H','D8xH10.5cm',226.0,'T27','白色 White','CB23-20983 Lush Wildflowers',80.0,105.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (117,5,'22488J','D8xH10.5cm',226.0,'T27','白色 White','307242 Citrus',80.0,105.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (118,5,'22488K','D8xH10.5cm',226.0,'T27','白色 White','CA-LAC2714 Pink Amber',80.0,105.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (119,5,'22488L','D8xH10.5cm',226.0,'T27','白色 White','307245 Summer Rain',80.0,105.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (120,5,'22488M','D8xH10.5cm',226.0,'T27','白色 White','DP1880 Vanilla Bean',80.0,105.0,NULL,'2026-08-29 06:27:18');
INSERT INTO "products" VALUES (151,6,'22488A','D8xH10.5cm',226.0,'T27','White','YS307244 Teakwood',80.0,105.0,NULL,'2026-08-29 07:02:14');
INSERT INTO "products" VALUES (152,6,'22488B','D8xH10.5cm',226.0,'T27','White','287939 One Fine Pine',80.0,105.0,NULL,'2026-08-29 07:02:14');
INSERT INTO "products" VALUES (153,6,'22488C','D8xH10.5cm',226.0,'T27','White','327244 Chai latte',80.0,105.0,NULL,'2026-08-29 07:02:14');
INSERT INTO "products" VALUES (154,6,'22488D','D8xH10.5cm',226.0,'T27','White','DP1876 Coconut Cove',80.0,105.0,NULL,'2026-08-29 07:02:14');
INSERT INTO "products" VALUES (155,6,'22488F','D8xH10.5cm',226.0,'T27','White','327249A flesh cut eucalyptus',80.0,105.0,NULL,'2026-08-29 07:02:14');
INSERT INTO "products" VALUES (156,6,'22488G','D8xH10.5cm',226.0,'T27','White','325587 Lavender dreams',80.0,105.0,NULL,'2026-08-29 07:02:14');
INSERT INTO "products" VALUES (157,6,'22488H','D8xH10.5cm',226.0,'T27','White','CB23-20983 Lush Wildflowers',80.0,105.0,NULL,'2026-08-29 07:02:14');
INSERT INTO "products" VALUES (158,6,'22488L','D8xH10.5cm',226.0,'T27','White','307245 Summer Rain',80.0,105.0,NULL,'2026-08-29 07:02:14');
INSERT INTO "products" VALUES (159,6,'22488M','D8xH10.5cm',226.0,'T27','White','DP1880 Vanilla Bean',80.0,105.0,NULL,'2026-08-29 07:02:14');
INSERT INTO "products" VALUES (160,6,'22025J','D11xH8cm',340.0,'T21','White','287939 One Fine Pine',110.0,80.0,NULL,'2026-08-29 07:02:14');
INSERT INTO "products" VALUES (161,6,'22025K','D11xH8cm',340.0,'T21','White','327244 Chai latte',110.0,80.0,NULL,'2026-08-29 07:02:14');
INSERT INTO "products" VALUES (162,6,'22025L','D11xH8cm',340.0,'T21','White','DP1876 Coconut Cove',110.0,80.0,NULL,'2026-08-29 07:02:14');
INSERT INTO "products" VALUES (163,6,'22025P','D11xH8cm',340.0,'T21','White','325587 Lavender dreams',110.0,80.0,NULL,'2026-08-29 07:02:14');
INSERT INTO "products" VALUES (164,6,'22025T','D11xH8cm',340.0,'T21','White','CA-LAC2714 Pink Amber',110.0,80.0,NULL,'2026-08-29 07:02:14');
INSERT INTO "products" VALUES (165,6,'22468J','D10xH14.5cm',538.0,'T24','White','327249A flesh cut eucalyptus',100.0,145.0,NULL,'2026-08-29 07:02:14');
INSERT INTO "products" VALUES (168,7,'22462JA','D8.5xH12cm',396.0,'T27','白色 White','AS05390-1 vanilla rose',85.0,120.0,NULL,'2026-08-31 01:30:41');
INSERT INTO "products" VALUES (169,7,'22462JB','D8.5xH12cm',396.0,'T27','白色 White','AS05410-1 sugared watermelon',85.0,120.0,NULL,'2026-08-31 01:30:41');
INSERT INTO "products" VALUES (170,8,'40056J','D8xH9cm',227.0,'T27','231C','UAP00062/00 
Hugs & Roses',80.0,90.0,NULL,'2026-08-31 02:04:29');
INSERT INTO "products" VALUES (171,8,'40056H','D8xH9cm',227.0,'T27','217C','UAP00058/00 
Cupid’s Cream',80.0,90.0,NULL,'2026-08-31 02:04:29');
INSERT INTO "products" VALUES (172,8,'40076Q','D7xH8.5cm',170.0,'T24','粉色 706C','UAP00062/00 
Blushing Petals',70.0,85.0,NULL,'2026-08-31 02:04:29');
INSERT INTO "products" VALUES (173,9,'22504A','D7.1xH9cm',184.0,'T24','白色 White','FA96203-8 玫瑰香',71.0,90.0,NULL,'2026-09-04 07:30:28');
INSERT INTO "products" VALUES (174,10,'22468M','10 x 14.5cm',53.0,'T24','White','307242',100.0,145.0,NULL,'2026-09-05 03:25:56');
INSERT INTO "products" VALUES (175,10,'22468L','10x14.5cm',538.0,'T24','White','CB23-20983',100.0,145.0,NULL,'2026-09-05 03:26:47');
INSERT INTO "products" VALUES (176,11,'3x4','D7.6xH10.2cm',337.0,'QT32','White','/',76.0,102.0,NULL,'2026-09-05 06:24:05');
INSERT INTO "products" VALUES (177,11,'3x3','D7.6xH7.6cm',229.0,'QT32','White','/',76.0,76.0,NULL,'2026-09-05 06:24:53');
INSERT INTO "products" VALUES (178,11,'3x6','D7.6xH15.2cm',504.0,'T34','White','/',76.0,152.0,NULL,'2026-09-05 06:25:28');
INSERT INTO "products" VALUES (179,11,'3x8','D7.6xH20.3cm',688.0,'T37','White','/',76.0,203.0,NULL,'2026-09-05 06:26:10');
INSERT INTO "products" VALUES (180,11,'3x3_ivory','D7.6xH7.6cm',229.0,'T34','Ivory','/',76.0,76.0,NULL,'2026-09-05 06:27:37');
INSERT INTO "products" VALUES (181,11,'3x4_ivory','D7.6xH10.2cm',337.0,'T34','Ivory','/',76.0,102.0,NULL,'2026-09-05 06:28:10');
INSERT INTO "products" VALUES (182,11,'3x6_ivory','D7.6xH15.2cm',504.0,'QT35','Ivory','/',76.0,152.0,NULL,'2026-09-05 06:28:51');
INSERT INTO "products" VALUES (183,11,'3x8_ivory','D7.6xH20.3cm',688.0,'QT35','Ivory','/',76.0,203.0,NULL,'2026-09-05 06:30:23');
INSERT INTO "products" VALUES (184,12,'22003AB-1','D6xH7cm',85.0,'T21','白色 White','CH48574F',60.0,70.0,NULL,'2026-09-05 07:46:58');
INSERT INTO "products" VALUES (185,12,'22003AB-2','D6xH7cm',85.0,'T21','白色 White','CH48576F',60.0,70.0,NULL,'2026-09-05 07:46:58');
INSERT INTO "products" VALUES (186,12,'22003AC-1','D6xH7cm',85.0,'T21','白色 White','CH48575F',60.0,70.0,NULL,'2026-09-05 07:46:58');
INSERT INTO "products" VALUES (187,12,'22003AC-2','D6xH7cm',85.0,'T21','白色 White','CH48556F',60.0,70.0,NULL,'2026-09-05 07:46:58');
INSERT INTO "products" VALUES (188,12,'22003AC-3','D6xH7cm',85.0,'T21','白色 White','CH48555F',60.0,70.0,NULL,'2026-09-05 07:46:58');
INSERT INTO "products" VALUES (189,12,'22003AC-4','D6xH7cm',85.0,'T21','白色 White','CH48572F',60.0,70.0,NULL,'2026-09-05 07:46:58');
INSERT INTO "products" VALUES (190,12,'22003Z-1','D6xH7cm',85.0,'T21','白色 White','F23-2971 Toasted Hazelnut Latte',60.0,70.0,NULL,'2026-09-05 07:46:58');
INSERT INTO "products" VALUES (191,12,'22003Z-2','D6xH7cm',85.0,'T21','白色 White','55905F Crimson Cranberry',60.0,70.0,NULL,'2026-09-05 07:46:58');
INSERT INTO "products" VALUES (192,12,'22003Z-3','D6xH7cm',85.0,'T21','白色 White','F23-2976 Harvest Apple',60.0,70.0,NULL,'2026-09-05 07:46:58');
INSERT INTO "products" VALUES (193,12,'22003Z-4','D6xH7cm',85.0,'T21','白色 White','F23-2977 Pumpkin Gingerale',60.0,70.0,NULL,'2026-09-05 07:46:58');
INSERT INTO "purchase_orders" VALUES (5,2,'YN26-0151','2026-08-29 06:25:19');
INSERT INTO "purchase_orders" VALUES (6,2,'YN26-0242','2026-08-29 06:59:14');
INSERT INTO "purchase_orders" VALUES (7,3,'YN26-0179','2026-08-31 01:30:21');
INSERT INTO "purchase_orders" VALUES (8,4,'YN26-0188','2026-08-31 02:03:48');
INSERT INTO "purchase_orders" VALUES (9,5,'YN26-0174','2026-09-04 07:30:28');
INSERT INTO "purchase_orders" VALUES (10,2,'YN26-0171','2026-09-05 03:24:30');
INSERT INTO "purchase_orders" VALUES (11,6,'YN26-0223/0224/0225','2026-09-05 06:17:03');
INSERT INTO "purchase_orders" VALUES (12,7,'YN26-0047','2026-09-05 07:46:58');
INSERT INTO "qc_standards" VALUES (1,'EN 15493','Flame hight','6','76','mm',1,NULL,'2026-09-05 03:57:19','2026-09-05 03:57:19');
INSERT INTO "qc_standards" VALUES (2,'EN 15493','After-smoke',NULL,'60','s',1,NULL,'2026-09-05 03:58:33','2026-09-05 03:58:33');
CREATE INDEX IF NOT EXISTS "idx_audit_created" ON "audit_logs" (
	"created_at"
);
CREATE INDEX IF NOT EXISTS "idx_log_test" ON "burn_test_logs" (
	"burn_test_id"
);
CREATE INDEX IF NOT EXISTS "idx_periodic_date" ON "periodic_checks" (
	"check_date"
);
CREATE INDEX IF NOT EXISTS "idx_periodic_item_check" ON "periodic_check_items" (
	"check_id"
);
CREATE INDEX IF NOT EXISTS "idx_periodic_template_item" ON "periodic_template_items" (
	"template_id"
);
CREATE INDEX IF NOT EXISTS "idx_photo_test" ON "burn_test_photos" (
	"burn_test_id"
);
CREATE INDEX IF NOT EXISTS "idx_po_customer" ON "purchase_orders" (
	"customer_id"
);
CREATE INDEX IF NOT EXISTS "idx_product_order" ON "products" (
	"order_id"
);
CREATE INDEX IF NOT EXISTS "idx_test_po" ON "burn_tests" (
	"purchase_order_id"
);
COMMIT;
