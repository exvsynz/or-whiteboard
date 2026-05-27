-- Seed areas: 67 total

-- Leader (1)
INSERT INTO areas (name, category, sort_order) VALUES
  ('Leader', 'leader', 1);

-- Fixed tasks (7)
INSERT INTO areas (name, category, sort_order) VALUES
  ('OPD前台',    'fixed_task', 10),
  ('住院前台',   'fixed_task', 11),
  ('麻後訪視',   'fixed_task', 12),
  ('諮詢室',     'fixed_task', 13),
  ('衛教室',     'fixed_task', 14),
  ('電子同意書', 'fixed_task', 15),
  ('庫房',       'fixed_task', 16);

-- Rooms R1-R31 (31)
INSERT INTO areas (name, category, sort_order) VALUES
  ('R1',  'room', 100), ('R2',  'room', 101), ('R3',  'room', 102),
  ('R4',  'room', 103), ('R5',  'room', 104), ('R6',  'room', 105),
  ('R7',  'room', 106), ('R8',  'room', 107), ('R9',  'room', 108),
  ('R10', 'room', 109), ('R11', 'room', 110), ('R12', 'room', 111),
  ('R13', 'room', 112), ('R14', 'room', 113), ('R15', 'room', 114),
  ('R16', 'room', 115), ('R17', 'room', 116), ('R18', 'room', 117),
  ('R19', 'room', 118), ('R20', 'room', 119), ('R21', 'room', 120),
  ('R22', 'room', 121), ('R23', 'room', 122), ('R24', 'room', 123),
  ('R25', 'room', 124), ('R26', 'room', 125), ('R27', 'room', 126),
  ('R28', 'room', 127), ('R29', 'room', 128), ('R30', 'room', 129),
  ('R31', 'room', 130);

-- 12-20 shift (6)
INSERT INTO areas (name, category, sort_order) VALUES
  ('12-20A1', 'shift_12_20', 200), ('12-20A2', 'shift_12_20', 201),
  ('12-20A3', 'shift_12_20', 202), ('12-20A4', 'shift_12_20', 203),
  ('12-20A5', 'shift_12_20', 204), ('12-20A6', 'shift_12_20', 205);

-- Evening shift (6)
INSERT INTO areas (name, category, sort_order) VALUES
  ('小夜A1', 'shift_evening', 210), ('小夜A2', 'shift_evening', 211),
  ('小夜A3', 'shift_evening', 212), ('小夜A4', 'shift_evening', 213),
  ('小夜A5', 'shift_evening', 214), ('小夜A6', 'shift_evening', 215);

-- Night shift (6)
INSERT INTO areas (name, category, sort_order) VALUES
  ('大夜A1', 'shift_night', 220), ('大夜A2', 'shift_night', 221),
  ('大夜A3', 'shift_night', 222), ('大夜A4', 'shift_night', 223),
  ('大夜A5', 'shift_night', 224), ('大夜A6', 'shift_night', 225);

-- Special: anesthesia outside OR (5)
INSERT INTO areas (name, category, sort_order) VALUES
  ('天使',     'special_anesthesia', 300),
  ('鏡檢',     'special_anesthesia', 301),
  ('鏡檢PAR',  'special_anesthesia', 302),
  ('健檢',     'special_anesthesia', 303),
  ('健檢PAR',  'special_anesthesia', 304);

-- Special: recovery room (2)
INSERT INTO areas (name, category, sort_order) VALUES
  ('住院PAR', 'special_recovery', 310),
  ('門診PAR', 'special_recovery', 311);

-- Special: case management (3)
INSERT INTO areas (name, category, sort_order) VALUES
  ('PCA',          'special_case_mgmt', 320),
  ('疼痛個案管理', 'special_case_mgmt', 321),
  ('ERAS個案管理', 'special_case_mgmt', 322);

-- Seed sample people (6)
INSERT INTO people (name, role, color) VALUES
  ('王小明', '麻醉護理師', 'bg-amber-100'),
  ('林怡君', 'Leader',     'bg-pink-100'),
  ('陳美玲', '前台',       'bg-green-100'),
  ('張志宏', 'PAR',        'bg-purple-100'),
  ('黃雅婷', 'PCA',        'bg-blue-100'),
  ('蔡宗翰', '小夜',       'bg-orange-100');
