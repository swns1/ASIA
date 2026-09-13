-- =============================================================
-- ASIA School Information System — Seed / Dummy Data
-- Database: SLIS THESIS FINAL (PostgreSQL)
-- Run with: psql -U postgres -d "SLIS THESIS FINAL" -f seed_data.sql
-- Re-runnable: ON CONFLICT DO NOTHING on all inserts
-- IDs start well above existing maxima to avoid collisions:
--   students 100+, households 100+, enrollments 200+, grades 500+
-- Subjects referenced are existing IDs from the DB:
--   Elementary Grade 4: 1-4  | Grade 6: 5-7
--   JHS Grade 7: 8-10        | Grade 8: 11-12 | Grade 10: 13-15
--   SHS Grade 11: 16-18      | Grade 12: 19-20
-- Grading components (from DB):
--   Template 2 (Elementary): Written Works=8, Performance Tasks=9, Quarterly Assessment=10
--   Template 3 (JHS):        Written Works=11, Performance Tasks=12, Quarterly Assessment=13
-- =============================================================

BEGIN;

-- =====================================================
-- HOUSEHOLDS  (IDs 100–151)
-- =====================================================
INSERT INTO households (household_id, parent_marital_status, living_arrangement, is_4ps_beneficiary, four_ps_id)
OVERRIDING SYSTEM VALUE VALUES
  (100, 'married',       'both_parents',  FALSE, NULL),
  (101, 'married',       'both_parents',  FALSE, NULL),
  (102, 'separated',     'mother_only',   TRUE,  '4PS-SEED-001'),
  (103, 'married',       'both_parents',  FALSE, NULL),
  (104, 'single_parent', 'mother_only',   TRUE,  '4PS-SEED-002'),
  (105, 'married',       'both_parents',  FALSE, NULL),
  (106, 'widowed',       'father_only',   FALSE, NULL),
  (107, 'married',       'both_parents',  FALSE, NULL),
  (108, 'separated',     'guardian',      TRUE,  '4PS-SEED-003'),
  (109, 'married',       'both_parents',  FALSE, NULL),
  (110, 'married',       'both_parents',  FALSE, NULL),
  (111, 'single_parent', 'mother_only',   FALSE, NULL),
  (112, 'married',       'both_parents',  FALSE, NULL),
  (113, 'annulled',      'mother_only',   FALSE, NULL),
  (114, 'married',       'both_parents',  TRUE,  '4PS-SEED-004'),
  (115, 'married',       'both_parents',  FALSE, NULL),
  (116, 'widowed',       'mother_only',   FALSE, NULL),
  (117, 'married',       'both_parents',  FALSE, NULL),
  (118, 'married',       'both_parents',  FALSE, NULL),
  (119, 'separated',     'relative',      TRUE,  '4PS-SEED-005'),
  (120, 'married',       'both_parents',  FALSE, NULL),
  (121, 'married',       'both_parents',  FALSE, NULL),
  (122, 'single_parent', 'mother_only',   FALSE, NULL),
  (123, 'married',       'both_parents',  FALSE, NULL),
  (124, 'married',       'both_parents',  FALSE, NULL),
  (125, 'married',       'both_parents',  FALSE, NULL),
  (126, 'separated',     'guardian',      FALSE, NULL),
  (127, 'married',       'both_parents',  FALSE, NULL),
  (128, 'married',       'both_parents',  FALSE, NULL),
  (129, 'widowed',       'mother_only',   TRUE,  '4PS-SEED-006'),
  (130, 'married',       'both_parents',  FALSE, NULL),
  (131, 'married',       'both_parents',  FALSE, NULL),
  (132, 'married',       'both_parents',  FALSE, NULL),
  (133, 'single_parent', 'father_only',   FALSE, NULL),
  (134, 'married',       'both_parents',  FALSE, NULL),
  (135, 'married',       'both_parents',  FALSE, NULL),
  (136, 'separated',     'mother_only',   FALSE, NULL),
  (137, 'married',       'both_parents',  FALSE, NULL),
  (138, 'married',       'both_parents',  FALSE, NULL),
  (139, 'married',       'both_parents',  FALSE, NULL),
  (140, 'married',       'both_parents',  FALSE, NULL),
  (141, 'annulled',      'guardian',      TRUE,  '4PS-SEED-007'),
  (142, 'married',       'both_parents',  FALSE, NULL),
  (143, 'married',       'both_parents',  FALSE, NULL),
  (144, 'married',       'both_parents',  FALSE, NULL),
  (145, 'widowed',       'father_only',   FALSE, NULL),
  (146, 'married',       'both_parents',  FALSE, NULL),
  (147, 'married',       'both_parents',  FALSE, NULL),
  (148, 'separated',     'relative',      FALSE, NULL),
  (149, 'married',       'both_parents',  FALSE, NULL),
  (150, 'married',       'both_parents',  FALSE, NULL),
  (151, 'married',       'both_parents',  FALSE, NULL)
ON CONFLICT DO NOTHING;

-- =====================================================
-- STUDENTS  (IDs 100–151)
-- Levels: Nursery/Kinder 100-109, Elementary 110-124,
--         Junior HS 125-139, Senior HS 140-151
-- LRNs use SEED prefix to avoid collision with existing
-- =====================================================
INSERT INTO students (
  student_id, student_number, lrn, first_name, middle_name, last_name, suffix,
  age, sex, religion, birth_date, email, mobile_number,
  status, current_address, permanent_address, household_id, updated_at
) OVERRIDING SYSTEM VALUE VALUES
  -- Nursery / Kindergarten (100–109)
  (100, 'SEED-0100', '136700000100', 'Maria',      'Santos',      'Reyes',       NULL, 5, 'female', 'Roman Catholic',   '2020-03-15', NULL,                         NULL,          'active',     'Blk 1 Lot 2 Sampaguita St., Brgy. San Jose, Quezon City',    'Blk 1 Lot 2 Sampaguita St., Brgy. San Jose, Quezon City',    100, NOW()),
  (101, 'SEED-0101', '136700000101', 'Juan',        'Cruz',        'Dela Cruz',   NULL, 4, 'male',   'Roman Catholic',   '2021-06-22', NULL,                         NULL,          'active',     '123 Mabini St., Brgy. Poblacion, Marikina City',              '123 Mabini St., Brgy. Poblacion, Marikina City',              101, NOW()),
  (102, 'SEED-0102', '136700000102', 'Ana',         'Bautista',    'Garcia',      NULL, 5, 'female', 'Born Again',       '2020-11-05', NULL,                         NULL,          'active',     '45 Rizal Ave., Brgy. Sta. Cruz, Pasig City',                  '45 Rizal Ave., Brgy. Sta. Cruz, Pasig City',                  102, NOW()),
  (103, 'SEED-0103', '136700000103', 'Carlos',      'Ong',         'Tan',         NULL, 6, 'male',   'Roman Catholic',   '2019-08-30', NULL,                         NULL,          'active',     '78 Bonifacio St., Brgy. San Isidro, Caloocan City',           '78 Bonifacio St., Brgy. San Isidro, Caloocan City',           103, NOW()),
  (104, 'SEED-0104', '136700000104', 'Sofia',       'Lim',         'Aquino',      NULL, 5, 'female', 'Iglesia ni Cristo','2020-02-14', NULL,                         NULL,          'active',     '22 Mango St., Brgy. Bagong Silang, Valenzuela City',          '22 Mango St., Brgy. Bagong Silang, Valenzuela City',          104, NOW()),
  (105, 'SEED-0105', '136700000105', 'Miguel',      'Ramos',       'Fernandez',   NULL, 4, 'male',   'Roman Catholic',   '2021-04-10', NULL,                         NULL,          'active',     '9 Kalaw St., Brgy. Malate, Manila',                           '9 Kalaw St., Brgy. Malate, Manila',                           105, NOW()),
  (106, 'SEED-0106', '136700000106', 'Isabella',    'Torres',      'Villanueva',  NULL, 6, 'female', 'Roman Catholic',   '2019-12-01', NULL,                         NULL,          'active',     '56 Quezon Blvd., Brgy. Sta. Mesa, Manila',                    '56 Quezon Blvd., Brgy. Sta. Mesa, Manila',                    106, NOW()),
  (107, 'SEED-0107', '136700000107', 'Rafael',      'Mendoza',     'Castillo',    NULL, 5, 'male',   'Protestant',       '2020-07-19', NULL,                         NULL,          'active',     '33 Luna St., Brgy. Ugong, Pasig City',                        '33 Luna St., Brgy. Ugong, Pasig City',                        107, NOW()),
  (108, 'SEED-0108', '136700000108', 'Camille',     'Navarro',     'Espinoza',    NULL, 5, 'female', 'Roman Catholic',   '2020-09-25', NULL,                         NULL,          'inactive',   '10 Magsaysay Ave., Brgy. San Antonio, Quezon City',           '10 Magsaysay Ave., Brgy. San Antonio, Quezon City',           108, NOW()),
  (109, 'SEED-0109', '136700000109', 'Andres',      'Florendo',    'Santiago',    NULL, 6, 'male',   'Roman Catholic',   '2019-05-07', NULL,                         NULL,          'active',     '88 Gen. Luna St., Brgy. Pacita, San Pedro, Laguna',           '88 Gen. Luna St., Brgy. Pacita, San Pedro, Laguna',           109, NOW()),
  -- Elementary (110–124)
  (110, 'SEED-0110', '136700000110', 'Bianca',      'Reyes',       'Soriano',     NULL, 10,'female', 'Roman Catholic',   '2015-03-20', NULL,                         NULL,          'active',     '14 Tulip St., Brgy. San Vicente, Pasig City',                 '14 Tulip St., Brgy. San Vicente, Pasig City',                 110, NOW()),
  (111, 'SEED-0111', '136700000111', 'Marco',       'Dela Cruz',   'Valdez',      NULL, 11,'male',   'Roman Catholic',   '2014-07-11', NULL,                         NULL,          'active',     '5 Dahlia St., Brgy. Bagong Barrio, Caloocan City',            '5 Dahlia St., Brgy. Bagong Barrio, Caloocan City',            111, NOW()),
  (112, 'SEED-0112', '136700000112', 'Kristine',    'Aguilar',     'Mercado',     NULL, 10,'female', 'Born Again',       '2015-11-28', NULL,                         NULL,          'active',     '77 Rosal St., Brgy. Pinyahan, Quezon City',                   '77 Rosal St., Brgy. Pinyahan, Quezon City',                   112, NOW()),
  (113, 'SEED-0113', '136700000113', 'Dominic',     'Fuentes',     'Pascual',     NULL, 11,'male',   'Roman Catholic',   '2014-04-03', NULL,                         NULL,          'active',     '31 Orchid St., Brgy. Manggahan, Pasig City',                  '31 Orchid St., Brgy. Manggahan, Pasig City',                  113, NOW()),
  (114, 'SEED-0114', '136700000114', 'Jasmine',     'Chua',        'Dizon',       NULL, 11,'female', 'Roman Catholic',   '2014-09-15', 'jasmine.dizon.seed@gmail.com','09171234601', 'active',    '62 Rose St., Brgy. Dela Paz, Antipolo City',                  '62 Rose St., Brgy. Dela Paz, Antipolo City',                  114, NOW()),
  (115, 'SEED-0115', '136700000115', 'Patrick',     'Salazar',     'Jimenez',     NULL, 10,'male',   'Iglesia ni Cristo','2015-01-22', NULL,                         NULL,          'active',     '19 Sunflower St., Brgy. Payatas, Quezon City',                '19 Sunflower St., Brgy. Payatas, Quezon City',                115, NOW()),
  (116, 'SEED-0116', '136700000116', 'Hannah',      'Morales',     'Beltran',     NULL, 11,'female', 'Roman Catholic',   '2014-06-30', NULL,                         NULL,          'active',     '43 Jasmine St., Brgy. Taguig, Taguig City',                   '43 Jasmine St., Brgy. Taguig, Taguig City',                   116, NOW()),
  (117, 'SEED-0117', '136700000117', 'Ryan',        'Gonzales',    'Ibarra',      NULL, 11,'male',   'Roman Catholic',   '2014-10-18', NULL,                         NULL,          'active',     '7 Sampaguita Rd., Brgy. Sto. Niño, Marikina City',            '7 Sampaguita Rd., Brgy. Sto. Niño, Marikina City',            117, NOW()),
  (118, 'SEED-0118', '136700000118', 'Alyssa',      'Villanueva',  'Cortez',      NULL, 11,'female', 'Roman Catholic',   '2014-02-05', 'alyssa.cortez.seed@gmail.com','09181234602', 'active',   '88 Everlasting St., Brgy. Novaliches, Quezon City',           '88 Everlasting St., Brgy. Novaliches, Quezon City',           118, NOW()),
  (119, 'SEED-0119', '136700000119', 'Kevin',       'Tan',         'Perez',       NULL, 12,'male',   'Protestant',       '2013-08-12', NULL,                         NULL,          'active',     '22 Iris St., Brgy. Batasan Hills, Quezon City',               '22 Iris St., Brgy. Batasan Hills, Quezon City',               119, NOW()),
  (120, 'SEED-0120', '136700000120', 'Patricia',    'Lim',         'Villafuerte', NULL, 10,'female', 'Roman Catholic',   '2015-05-17', NULL,                         NULL,          'active',     '3 Mariposa St., Brgy. Silangan, San Mateo, Rizal',            '3 Mariposa St., Brgy. Silangan, San Mateo, Rizal',            120, NOW()),
  (121, 'SEED-0121', '136700000121', 'Jerome',      'Santos',      'Evangelista', NULL, 11,'male',   'Roman Catholic',   '2014-03-09', NULL,                         NULL,          'transferred','55 Narra St., Brgy. Bagbag, Quezon City',                      '55 Narra St., Brgy. Bagbag, Quezon City',                      121, NOW()),
  (122, 'SEED-0122', '136700000122', 'Angelica',    'Reyes',       'Domingo',     NULL, 10,'female', 'Born Again',       '2015-12-24', NULL,                         NULL,          'active',     '14 Niyog St., Brgy. San Isidro, Cainta, Rizal',               '14 Niyog St., Brgy. San Isidro, Cainta, Rizal',               122, NOW()),
  (123, 'SEED-0123', '136700000123', 'Nathan',      'Cruz',        'Rosales',     NULL, 11,'male',   'Roman Catholic',   '2014-07-21', NULL,                         NULL,          'active',     '67 Ilang-Ilang St., Brgy. Dulong Bayan, Marikina City',       '67 Ilang-Ilang St., Brgy. Dulong Bayan, Marikina City',       123, NOW()),
  (124, 'SEED-0124', '136700000124', 'Tricia',      'Ocampo',      'Hernandez',   NULL, 12,'female', 'Roman Catholic',   '2013-04-08', 'tricia.h.seed@gmail.com',    '09191234603', 'active',    '29 Waling-Waling St., Brgy. Kamuning, Quezon City',           '29 Waling-Waling St., Brgy. Kamuning, Quezon City',           124, NOW()),
  -- Junior HS (125–139)
  (125, 'SEED-0125', '136700000125', 'Joshua',      'Buenaventura','Medina',      NULL, 13,'male',   'Roman Catholic',   '2012-09-14', NULL,                         NULL,          'active',     '101 Sampaguita Ave., Brgy. Pasong Tamo, Quezon City',         '101 Sampaguita Ave., Brgy. Pasong Tamo, Quezon City',         125, NOW()),
  (126, 'SEED-0126', '136700000126', 'Christine',   'Roca',        'Briones',     NULL, 14,'female', 'Roman Catholic',   '2011-02-28', NULL,                         '09201234604', 'active',    '34 Catmon St., Brgy. Malinao, Pasig City',                    '34 Catmon St., Brgy. Malinao, Pasig City',                    126, NOW()),
  (127, 'SEED-0127', '136700000127', 'Mark',        'Aquino',      'Navarro',     NULL, 13,'male',   'Iglesia ni Cristo','2012-06-17', NULL,                         NULL,          'active',     '18 Bamboo St., Brgy. Pinagbuhatan, Pasig City',               '18 Bamboo St., Brgy. Pinagbuhatan, Pasig City',               127, NOW()),
  (128, 'SEED-0128', '136700000128', 'Natasha',     'Guerrero',    'Flores',      NULL, 15,'female', 'Roman Catholic',   '2010-11-03', 'natasha.f.seed@gmail.com',   '09211234605', 'active',    '5 Acacia St., Brgy. Calauan, Laguna',                         '5 Acacia St., Brgy. Calauan, Laguna',                         128, NOW()),
  (129, 'SEED-0129', '136700000129', 'Daniel',      'Paglinawan',  'Ramirez',     NULL, 15,'male',   'Born Again',       '2010-08-22', NULL,                         NULL,          'active',     '88 Narra Ave., Brgy. Barangka, Mandaluyong City',             '88 Narra Ave., Brgy. Barangka, Mandaluyong City',             129, NOW()),
  (130, 'SEED-0130', '136700000130', 'Stephanie',   'Bondoc',      'Magno',       NULL, 13,'female', 'Roman Catholic',   '2012-04-05', NULL,                         NULL,          'active',     '7 Mabolo St., Brgy. Cembo, Makati City',                      '7 Mabolo St., Brgy. Cembo, Makati City',                      130, NOW()),
  (131, 'SEED-0131', '136700000131', 'Christian',   'Padilla',     'Tolentino',   NULL, 14,'male',   'Roman Catholic',   '2011-10-30', NULL,                         '09221234606', 'active',    '23 Molave St., Brgy. Bagumbayan, Quezon City',                '23 Molave St., Brgy. Bagumbayan, Quezon City',                131, NOW()),
  (132, 'SEED-0132', '136700000132', 'Mia',         'Recio',       'Evangelista', NULL, 14,'female', 'Protestant',       '2011-07-16', NULL,                         NULL,          'active',     '55 Ylang-Ylang St., Brgy. San Roque, Antipolo City',          '55 Ylang-Ylang St., Brgy. San Roque, Antipolo City',          132, NOW()),
  (133, 'SEED-0133', '136700000133', 'Vincent',     'Alcantara',   'Batungbakal', NULL, 15,'male',   'Roman Catholic',   '2010-03-19', 'vincent.b.seed@gmail.com',   '09231234607', 'active',   '42 Dao St., Brgy. Dela Paz, Antipolo City',                   '42 Dao St., Brgy. Dela Paz, Antipolo City',                   133, NOW()),
  (134, 'SEED-0134', '136700000134', 'Pauline',     'Pascua',      'Macapagal',   NULL, 13,'female', 'Roman Catholic',   '2012-01-07', NULL,                         NULL,          'active',     '9 Camia St., Brgy. San Antonio, San Pedro, Laguna',           '9 Camia St., Brgy. San Antonio, San Pedro, Laguna',           134, NOW()),
  (135, 'SEED-0135', '136700000135', 'Aaron',       'Cabrera',     'Manalo',      NULL, 14,'male',   'Iglesia ni Cristo','2011-05-25', NULL,                         NULL,          'active',     '16 Carabao St., Brgy. San Miguel, Pasig City',                '16 Carabao St., Brgy. San Miguel, Pasig City',                135, NOW()),
  (136, 'SEED-0136', '136700000136', 'Clarissa',    'Mateo',       'Baluyot',     NULL, 15,'female', 'Roman Catholic',   '2010-12-11', NULL,                         NULL,          'inactive',   '63 Ilang-Ilang Ave., Brgy. Pineda, Pasig City',               '63 Ilang-Ilang Ave., Brgy. Pineda, Pasig City',               136, NOW()),
  (137, 'SEED-0137', '136700000137', 'Emmanuel',    'Poblete',     'Jimenez',     NULL, 13,'male',   'Roman Catholic',   '2012-08-04', NULL,                         NULL,          'active',     '38 Ipil St., Brgy. Sto. Tomas, Pasig City',                   '38 Ipil St., Brgy. Sto. Tomas, Pasig City',                   137, NOW()),
  (138, 'SEED-0138', '136700000138', 'Abigail',     'Ramos',       'Fajardo',     NULL, 15,'female', 'Born Again',       '2010-06-29', 'abigail.f.seed@gmail.com',   '09241234608', 'active',   '71 Atis St., Brgy. San Juan, Cainta, Rizal',                  '71 Atis St., Brgy. San Juan, Cainta, Rizal',                  138, NOW()),
  (139, 'SEED-0139', '136700000139', 'Brandon',     'Ignacio',     'Coronel',     NULL, 14,'male',   'Roman Catholic',   '2011-09-18', NULL,                         NULL,          'active',     '50 Banaba St., Brgy. Kasiglahan, San Jose Del Monte, Bulacan', '50 Banaba St., Brgy. Kasiglahan, San Jose Del Monte, Bulacan',139, NOW()),
  -- Senior HS (140–151)
  (140, 'SEED-0140', '136700000140', 'Andrea',      'Padua',       'Lagman',      NULL, 17,'female', 'Roman Catholic',   '2008-04-21', 'andrea.l.seed@gmail.com',    '09251234609', 'active',   '12 Pine St., Brgy. Plainview, Mandaluyong City',             '12 Pine St., Brgy. Plainview, Mandaluyong City',             140, NOW()),
  (141, 'SEED-0141', '136700000141', 'Jeremiah',    'Villegas',    'Santos',      NULL, 16,'male',   'Roman Catholic',   '2009-08-14', NULL,                         '09261234610', 'active',    '34 Oak St., Brgy. Addition Hills, Mandaluyong City',          '34 Oak St., Brgy. Addition Hills, Mandaluyong City',          141, NOW()),
  (142, 'SEED-0142', '136700000142', 'Francesca',   'Robles',      'Dizon',       NULL, 17,'female', 'Roman Catholic',   '2008-11-30', 'francesca.d.seed@gmail.com', '09271234611', 'active',   '56 Maple St., Brgy. Vergara, Mandaluyong City',              '56 Maple St., Brgy. Vergara, Mandaluyong City',              142, NOW()),
  (143, 'SEED-0143', '136700000143', 'Raphael',     'Corpus',      'Avila',       NULL, 16,'male',   'Protestant',       '2009-03-07', NULL,                         NULL,          'active',     '78 Cedar St., Brgy. Wack-Wack, Mandaluyong City',            '78 Cedar St., Brgy. Wack-Wack, Mandaluyong City',            143, NOW()),
  (144, 'SEED-0144', '136700000144', 'Samantha',    'Bañez',       'Marquez',     NULL, 17,'female', 'Iglesia ni Cristo','2008-07-22', 'samantha.m.seed@gmail.com',  '09281234612', 'active',   '90 Birch St., Brgy. Hagdang Bato, Mandaluyong City',         '90 Birch St., Brgy. Hagdang Bato, Mandaluyong City',         144, NOW()),
  (145, 'SEED-0145', '136700000145', 'Elijah',      'Tadeo',       'Reyes',       NULL, 16,'male',   'Roman Catholic',   '2009-12-05', NULL,                         NULL,          'active',     '100 Elm St., Brgy. Burol, Malabon City',                      '100 Elm St., Brgy. Burol, Malabon City',                      145, NOW()),
  (146, 'SEED-0146', '136700000146', 'Vanessa',     'Malabanan',   'Catalan',     NULL, 17,'female', 'Roman Catholic',   '2008-02-18', 'vanessa.c.seed@gmail.com',   '09291234613', 'active',   '22 Fir St., Brgy. Longos, Malabon City',                      '22 Fir St., Brgy. Longos, Malabon City',                      146, NOW()),
  (147, 'SEED-0147', '136700000147', 'Gabriel',     'Cayabyab',    'Maceda',      NULL, 16,'male',   'Born Again',       '2009-05-31', NULL,                         NULL,          'active',     '44 Spruce St., Brgy. Catmon, Malabon City',                   '44 Spruce St., Brgy. Catmon, Malabon City',                   147, NOW()),
  (148, 'SEED-0148', '136700000148', 'Erica',       'Palma',       'Guerrero',    NULL, 17,'female', 'Roman Catholic',   '2008-09-11', 'erica.g.seed@gmail.com',     '09301234614', 'active',   '66 Willow St., Brgy. Tañong, Malabon City',                   '66 Willow St., Brgy. Tañong, Malabon City',                   148, NOW()),
  (149, 'SEED-0149', '136700000149', 'Dominique',   'Esguerra',    'Buenaflor',   NULL, 16,'male',   'Roman Catholic',   '2009-10-24', NULL,                         NULL,          'active',     '88 Aspen St., Brgy. Hulong Duhat, Malabon City',              '88 Aspen St., Brgy. Hulong Duhat, Malabon City',              149, NOW()),
  (150, 'SEED-0150', '136700000150', 'Isabelle',    'Macaraeg',    'Aguilar',     NULL, 17,'female', 'Protestant',       '2008-06-03', 'isabelle.a.seed@gmail.com',  '09311234615', 'graduated', '10 Sequoia St., Brgy. Concepcion, Marikina City',            '10 Sequoia St., Brgy. Concepcion, Marikina City',            150, NOW()),
  (151, 'SEED-0151', '136700000151', 'Cedric',      'Peñaranda',   'Magalang',    NULL, 17,'male',   'Roman Catholic',   '2008-01-15', NULL,                         NULL,          'active',     '28 Redwood St., Brgy. Tumana, Marikina City',                 '28 Redwood St., Brgy. Tumana, Marikina City',                 151, NOW())
ON CONFLICT DO NOTHING;

-- =====================================================
-- GUARDIANS
-- =====================================================
INSERT INTO guardians (student_id, relationship, full_name, occupation, email_address, mobile_number, is_primary_contact)
VALUES
  (100, 'mother',   'Maribel Santos Reyes',         'Teacher',         'maribel.reyes.seed@gmail.com', '09171100001', TRUE),
  (100, 'father',   'Roberto Cruz Reyes',           'Engineer',        NULL,                           '09181100001', FALSE),
  (101, 'mother',   'Lourdes Cruz Dela Cruz',       'Housewife',       NULL,                           '09191100002', TRUE),
  (102, 'mother',   'Gloria Bautista Garcia',       'Vendor',          NULL,                           '09211100003', TRUE),
  (103, 'mother',   'Cecilia Ong Tan',              'Nurse',           'cecilia.tan.seed@gmail.com',   '09221100004', TRUE),
  (103, 'father',   'Alfonso Tan',                  'Businessman',     NULL,                           '09231100004', FALSE),
  (104, 'mother',   'Maricel Lim Aquino',           'Seamstress',      NULL,                           '09241100005', TRUE),
  (105, 'father',   'Rodrigo Ramos Fernandez',      'Security Guard',  NULL,                           '09251100006', TRUE),
  (106, 'father',   'Eduardo Torres Villanueva',    'OFW',             NULL,                           '09261100007', TRUE),
  (107, 'mother',   'Josefina Mendoza Castillo',    'Accountant',      NULL,                           '09271100008', TRUE),
  (108, 'guardian', 'Leonida Navarro Espinoza',     'Retired',         NULL,                           '09291100009', TRUE),
  (109, 'mother',   'Teresita Florendo Santiago',   'Laundrywoman',    NULL,                           '09301100010', TRUE),
  (110, 'mother',   'Liza Reyes Soriano',           'Teacher',         NULL,                           '09321100011', TRUE),
  (111, 'mother',   'Nora Dela Cruz Valdez',        'Housewife',       NULL,                           '09331100012', TRUE),
  (111, 'father',   'Antonio Valdez',               'Carpenter',       NULL,                           '09341100012', FALSE),
  (112, 'mother',   'Susan Aguilar Mercado',        'Vendor',          NULL,                           '09351100013', TRUE),
  (113, 'mother',   'Elvira Fuentes Pascual',       'Nurse',           NULL,                           '09361100014', TRUE),
  (114, 'mother',   'Maria Chua Dizon',             'Accountant',      NULL,                           '09381100015', TRUE),
  (115, 'father',   'Danilo Salazar Jimenez',       'Electrician',     NULL,                           '09401100016', TRUE),
  (116, 'mother',   'Cynthia Morales Beltran',      'Widow',           NULL,                           '09411100017', TRUE),
  (117, 'mother',   'Perla Gonzales Ibarra',        'Teacher',         NULL,                           '09421100018', TRUE),
  (118, 'mother',   'Alma Villanueva Cortez',       'Nurse',           NULL,                           '09441100019', TRUE),
  (119, 'guardian', 'Ramona Tan Perez',             'Retired Teacher', NULL,                           '09451100020', TRUE),
  (120, 'mother',   'Felicidad Lim Villafuerte',    'Housewife',       NULL,                           '09461100021', TRUE),
  (121, 'mother',   'Nenita Santos Evangelista',    'Laundrywoman',    NULL,                           '09481100022', TRUE),
  (122, 'mother',   'Rowena Reyes Domingo',         'Vendor',          NULL,                           '09491100023', TRUE),
  (123, 'father',   'Victor Cruz Rosales',          'Driver',          NULL,                           '09501100024', TRUE),
  (124, 'mother',   'Leonor Ocampo Hernandez',      'Secretary',       NULL,                           '09511100025', TRUE),
  (125, 'father',   'Alfredo Buenaventura Medina',  'OFW',             NULL,                           '09521100026', TRUE),
  (126, 'mother',   'Carmen Roca Briones',          'Housewife',       NULL,                           '09531100027', TRUE),
  (127, 'mother',   'Josie Aquino Navarro',         'Seamstress',      NULL,                           '09541100028', TRUE),
  (128, 'mother',   'Rita Guerrero Flores',         'Teacher',         NULL,                           '09551100029', TRUE),
  (129, 'guardian', 'Ligaya Paglinawan Ramirez',    'Widow',           NULL,                           '09571100030', TRUE),
  (130, 'mother',   'Erlinda Bondoc Magno',         'Housewife',       NULL,                           '09581100031', TRUE),
  (131, 'father',   'Cesar Padilla Tolentino',      'Driver',          NULL,                           '09601100032', TRUE),
  (132, 'mother',   'Myrna Recio Evangelista',      'Vendor',          NULL,                           '09611100033', TRUE),
  (133, 'mother',   'Violeta Alcantara Batungbakal','Nurse',            NULL,                           '09621100034', TRUE),
  (134, 'mother',   'Edna Pascua Macapagal',        'Housewife',       NULL,                           '09631100035', TRUE),
  (135, 'father',   'Fernando Cabrera Manalo',      'Mechanic',        NULL,                           '09651100036', TRUE),
  (136, 'mother',   'Divina Mateo Baluyot',         'Separated',       NULL,                           '09661100037', TRUE),
  (137, 'father',   'Rogelio Poblete Jimenez',      'Security Guard',  NULL,                           '09671100038', TRUE),
  (138, 'mother',   'Anita Ramos Fajardo',          'Teacher',         NULL,                           '09681100039', TRUE),
  (139, 'father',   'Leonel Ignacio Coronel',       'Engineer',        NULL,                           '09691100040', TRUE),
  (140, 'mother',   'Gloria Padua Lagman',          'Accountant',      NULL,                           '09701100041', TRUE),
  (140, 'father',   'Alfonso Lagman',               'Businessman',     NULL,                           '09711100041', FALSE),
  (141, 'guardian', 'Natividad Villegas Santos',    'Retired',         NULL,                           '09721100042', TRUE),
  (142, 'mother',   'Corazon Robles Dizon',         'Teacher',         NULL,                           '09731100043', TRUE),
  (143, 'father',   'Bernard Corpus Avila',         'Driver',          NULL,                           '09741100044', TRUE),
  (144, 'mother',   'Milagros Bañez Marquez',       'Nurse',           NULL,                           '09751100045', TRUE),
  (145, 'father',   'Rodrigo Tadeo Reyes',          'Widower',         NULL,                           '09761100046', TRUE),
  (146, 'mother',   'Caridad Malabanan Catalan',    'Housewife',       NULL,                           '09771100047', TRUE),
  (147, 'father',   'Artemio Cayabyab Maceda',      'Carpenter',       NULL,                           '09781100048', TRUE),
  (148, 'mother',   'Rosario Palma Guerrero',       'Vendor',          NULL,                           '09791100049', TRUE),
  (149, 'father',   'Danilo Esguerra Buenaflor',    'OFW',             NULL,                           '09801100050', TRUE),
  (150, 'mother',   'Luzviminda Macaraeg Aguilar',  'Teacher',         NULL,                           '09811100051', TRUE),
  (151, 'father',   'Ricardo Peñaranda Magalang',   'Engineer',        NULL,                           '09821100052', TRUE),
  -- Second child for the guardian portal account below. Student 110 already
  -- has a primary contact (their mother), so this is a non-primary
  -- relationship='guardian' row -- a child can have a mother on record and a
  -- separate registered guardian. Keeps uq_guardian_primary_per_student happy.
  (110, 'guardian', 'Maribel Santos Reyes',         'Teacher',         'maribel.reyes.seed@gmail.com', '09171100001', FALSE)
ON CONFLICT DO NOTHING;

-- Link the guardian portal account (users.user_id = 6) to its two children.
-- guardians.guardian_id is generated, so match on (student_id, full_name)
-- rather than hardcoding ids. guardians.user_id is deliberately NOT unique --
-- one parent with two children owns two rows pointing at the same user (see
-- student-service/students/models.py). Student 100 has one enrollment and
-- student 110 has two (2024-2025 completed + 2025-2026 enrolled), so this
-- also exercises GuardianHomePage's one-card-per-child grouping.
UPDATE guardians SET user_id = 6
WHERE (student_id = 100 AND full_name = 'Maribel Santos Reyes')
   OR (student_id = 110 AND full_name = 'Maribel Santos Reyes');

-- =====================================================
-- PREVIOUS SCHOOLS
-- =====================================================
INSERT INTO previous_schools (student_id, school_name, school_address)
VALUES
  (110, 'Little Stars Day Care Center',             'Brgy. San Vicente, Pasig City'),
  (111, 'Sunshine Preschool',                       'Brgy. Bagong Barrio, Caloocan City'),
  (112, 'Happy Kids Nursery',                       'Brgy. Pinyahan, Quezon City'),
  (113, 'St. Joseph Elementary School',             'Brgy. Manggahan, Pasig City'),
  (114, 'Dela Paz Elementary School',               'Brgy. Dela Paz, Antipolo City'),
  (115, 'Payatas Elementary School',                'Brgy. Payatas, Quezon City'),
  (116, 'Taguig Elementary School',                 'Brgy. Taguig, Taguig City'),
  (117, 'Sto. Niño Elementary School',              'Brgy. Sto. Niño, Marikina City'),
  (118, 'Novaliches Central Elementary School',     'Brgy. Novaliches, Quezon City'),
  (119, 'Batasan Hills Elementary School',          'Brgy. Batasan Hills, Quezon City'),
  (120, 'San Mateo Central Elementary School',      'Brgy. Silangan, San Mateo, Rizal'),
  (121, 'Bagbag Elementary School',                 'Brgy. Bagbag, Quezon City'),
  (122, 'Cainta Elementary School',                 'Brgy. San Isidro, Cainta, Rizal'),
  (123, 'Marikina Elementary School',               'Brgy. Dulong Bayan, Marikina City'),
  (124, 'Kamuning Elementary School',               'Brgy. Kamuning, Quezon City'),
  (125, 'Pasong Tamo Elementary School',            'Brgy. Pasong Tamo, Quezon City'),
  (126, 'Malinao Elementary School',                'Brgy. Malinao, Pasig City'),
  (127, 'Pinagbuhatan Elementary School',           'Brgy. Pinagbuhatan, Pasig City'),
  (128, 'Calauan Central Elementary School',        'Brgy. Calauan, Laguna'),
  (129, 'Barangka Elementary School',               'Brgy. Barangka, Mandaluyong City'),
  (130, 'Cembo Elementary School',                  'Brgy. Cembo, Makati City'),
  (131, 'Bagumbayan Elementary School',             'Brgy. Bagumbayan, Quezon City'),
  (132, 'San Roque Elementary School',              'Brgy. San Roque, Antipolo City'),
  (133, 'Dela Paz Elementary School',               'Brgy. Dela Paz, Antipolo City'),
  (134, 'San Antonio Elementary School',            'Brgy. San Antonio, San Pedro, Laguna'),
  (135, 'San Miguel Elementary School',             'Brgy. San Miguel, Pasig City'),
  (136, 'Pineda Elementary School',                 'Brgy. Pineda, Pasig City'),
  (137, 'Sto. Tomas Elementary School',             'Brgy. Sto. Tomas, Pasig City'),
  (138, 'San Juan Elementary School',               'Brgy. San Juan, Cainta, Rizal'),
  (139, 'Kasiglahan Village Elementary School',     'Brgy. Kasiglahan, San Jose Del Monte, Bulacan'),
  (140, 'Mandaluyong City National High School',    'Plainview, Mandaluyong City'),
  (141, 'Addition Hills National High School',      'Addition Hills, Mandaluyong City'),
  (142, 'Vergara National High School',             'Vergara, Mandaluyong City'),
  (143, 'Wack-Wack National High School',           'Wack-Wack, Mandaluyong City'),
  (144, 'Hagdang Bato National High School',        'Hagdang Bato, Mandaluyong City'),
  (145, 'Malabon National High School',             'Burol, Malabon City'),
  (146, 'Longos National High School',              'Longos, Malabon City'),
  (147, 'Catmon National High School',              'Catmon, Malabon City'),
  (148, 'Tañong National High School',              'Tañong, Malabon City'),
  (149, 'Hulong Duhat National High School',        'Hulong Duhat, Malabon City'),
  (150, 'Concepcion National High School',          'Concepcion, Marikina City'),
  (151, 'Tumana National High School',              'Tumana, Marikina City')
ON CONFLICT DO NOTHING;

-- =====================================================
-- ENROLLMENTS  (IDs 200–278)
-- References only students 100-151 (our seed students)
-- School years: 2024-2025 (completed), 2025-2026 (enrolled)
-- Grade levels/subjects tied to existing subjects in DB:
--   Elementary Grade 4 → subjects 1-4
--   Elementary Grade 6 → subjects 5-7
--   JHS Grade 7        → subjects 8-10
--   JHS Grade 8        → subjects 11-12
--   JHS Grade 10       → subjects 13-15
--   SHS Grade 11       → subjects 16-18
--   SHS Grade 12       → subjects 19-20
-- =====================================================
INSERT INTO enrollments (enrollment_id, student_id, school_year, school_level, grade_level, section, strand, semester, enrollment_status)
OVERRIDING SYSTEM VALUE VALUES
  -- Nursery/Kinder 2025-2026
  (200, 100, '2025-2026', 'kindergarten',    'Kindergarten', 'Sunflower', NULL,   NULL,  'enrolled'),
  (201, 101, '2025-2026', 'nursery',         'Nursery',      'Rose',      NULL,   NULL,  'enrolled'),
  (202, 102, '2025-2026', 'kindergarten',    'Kindergarten', 'Daisy',     NULL,   NULL,  'enrolled'),
  (203, 103, '2025-2026', 'kindergarten',    'Kindergarten', 'Lily',      NULL,   NULL,  'enrolled'),
  (204, 104, '2025-2026', 'nursery',         'Nursery',      'Rose',      NULL,   NULL,  'enrolled'),
  (205, 105, '2025-2026', 'nursery',         'Nursery',      'Daisy',     NULL,   NULL,  'enrolled'),
  (206, 106, '2025-2026', 'kindergarten',    'Kindergarten', 'Sunflower', NULL,   NULL,  'enrolled'),
  (207, 107, '2025-2026', 'nursery',         'Nursery',      'Rose',      NULL,   NULL,  'enrolled'),
  (208, 108, '2024-2025', 'nursery',         'Nursery',      'Daisy',     NULL,   NULL,  'completed'),
  (209, 109, '2025-2026', 'kindergarten',    'Kindergarten', 'Lily',      NULL,   NULL,  'enrolled'),
  -- Elementary Grade 4 — 2024-2025 completed
  (210, 110, '2024-2025', 'elementary',      'Grade 4',      'A',         NULL,   NULL,  'completed'),
  (211, 112, '2024-2025', 'elementary',      'Grade 4',      'B',         NULL,   NULL,  'completed'),
  (212, 115, '2024-2025', 'elementary',      'Grade 4',      'C',         NULL,   NULL,  'completed'),
  (213, 120, '2024-2025', 'elementary',      'Grade 4',      'A',         NULL,   NULL,  'completed'),
  (214, 122, '2024-2025', 'elementary',      'Grade 4',      'B',         NULL,   NULL,  'completed'),
  -- Elementary Grade 4 — 2025-2026 current
  (215, 110, '2025-2026', 'elementary',      'Grade 4',      'A',         NULL,   NULL,  'enrolled'),
  (216, 112, '2025-2026', 'elementary',      'Grade 4',      'B',         NULL,   NULL,  'enrolled'),
  (217, 115, '2025-2026', 'elementary',      'Grade 4',      'C',         NULL,   NULL,  'enrolled'),
  (218, 120, '2025-2026', 'elementary',      'Grade 4',      'A',         NULL,   NULL,  'enrolled'),
  (219, 122, '2025-2026', 'elementary',      'Grade 4',      'B',         NULL,   NULL,  'enrolled'),
  -- Elementary Grade 6 — 2024-2025 completed
  (220, 111, '2024-2025', 'elementary',      'Grade 6',      'A',         NULL,   NULL,  'completed'),
  (221, 113, '2024-2025', 'elementary',      'Grade 6',      'B',         NULL,   NULL,  'completed'),
  (222, 114, '2024-2025', 'elementary',      'Grade 6',      'A',         NULL,   NULL,  'completed'),
  (223, 116, '2024-2025', 'elementary',      'Grade 6',      'C',         NULL,   NULL,  'completed'),
  (224, 119, '2024-2025', 'elementary',      'Grade 6',      'A',         NULL,   NULL,  'completed'),
  (225, 123, '2024-2025', 'elementary',      'Grade 6',      'B',         NULL,   NULL,  'completed'),
  (226, 124, '2024-2025', 'elementary',      'Grade 6',      'A',         NULL,   NULL,  'completed'),
  -- Elementary Grade 6 — 2025-2026 current
  (227, 111, '2025-2026', 'elementary',      'Grade 6',      'A',         NULL,   NULL,  'enrolled'),
  (228, 114, '2025-2026', 'elementary',      'Grade 6',      'A',         NULL,   NULL,  'enrolled'),
  (229, 119, '2025-2026', 'elementary',      'Grade 6',      'B',         NULL,   NULL,  'enrolled'),
  (230, 124, '2025-2026', 'elementary',      'Grade 6',      'A',         NULL,   NULL,  'enrolled'),
  -- JHS Grade 7 — 2024-2025
  (231, 125, '2024-2025', 'junior_highschool','Grade 7',     'Diamond',   NULL,   NULL,  'completed'),
  (232, 127, '2024-2025', 'junior_highschool','Grade 7',     'Pearl',     NULL,   NULL,  'completed'),
  (233, 130, '2024-2025', 'junior_highschool','Grade 7',     'Diamond',   NULL,   NULL,  'completed'),
  (234, 134, '2024-2025', 'junior_highschool','Grade 7',     'Sapphire',  NULL,   NULL,  'completed'),
  (235, 137, '2024-2025', 'junior_highschool','Grade 7',     'Pearl',     NULL,   NULL,  'completed'),
  -- JHS Grade 7 — 2025-2026
  (236, 125, '2025-2026', 'junior_highschool','Grade 7',     'Diamond',   NULL,   NULL,  'enrolled'),
  (237, 127, '2025-2026', 'junior_highschool','Grade 7',     'Pearl',     NULL,   NULL,  'enrolled'),
  (238, 130, '2025-2026', 'junior_highschool','Grade 7',     'Diamond',   NULL,   NULL,  'enrolled'),
  (239, 134, '2025-2026', 'junior_highschool','Grade 7',     'Sapphire',  NULL,   NULL,  'enrolled'),
  (240, 137, '2025-2026', 'junior_highschool','Grade 7',     'Pearl',     NULL,   NULL,  'enrolled'),
  -- JHS Grade 8 — 2025-2026
  (241, 126, '2025-2026', 'junior_highschool','Grade 8',     'Emerald',   NULL,   NULL,  'enrolled'),
  (242, 131, '2025-2026', 'junior_highschool','Grade 8',     'Ruby',      NULL,   NULL,  'enrolled'),
  (243, 132, '2025-2026', 'junior_highschool','Grade 8',     'Emerald',   NULL,   NULL,  'enrolled'),
  (244, 135, '2025-2026', 'junior_highschool','Grade 8',     'Ruby',      NULL,   NULL,  'enrolled'),
  -- JHS Grade 10 — 2025-2026
  (245, 128, '2025-2026', 'junior_highschool','Grade 10',    'Sapphire',  NULL,   NULL,  'enrolled'),
  (246, 129, '2025-2026', 'junior_highschool','Grade 10',    'Ruby',      NULL,   NULL,  'enrolled'),
  (247, 133, '2025-2026', 'junior_highschool','Grade 10',    'Diamond',   NULL,   NULL,  'enrolled'),
  (248, 138, '2025-2026', 'junior_highschool','Grade 10',    'Sapphire',  NULL,   NULL,  'enrolled'),
  (249, 139, '2025-2026', 'junior_highschool','Grade 10',    'Ruby',      NULL,   NULL,  'enrolled'),
  -- SHS Grade 11 — 2024-2025 completed
  (250, 140, '2024-2025', 'senior_highschool','Grade 11',    'STEM-A',    'STEM', '1st', 'completed'),
  (251, 141, '2024-2025', 'senior_highschool','Grade 11',    'STEM-A',    'STEM', '1st', 'completed'),
  (252, 142, '2024-2025', 'senior_highschool','Grade 11',    'STEM-B',    'STEM', '1st', 'completed'),
  (253, 143, '2024-2025', 'senior_highschool','Grade 11',    'STEM-B',    'STEM', '1st', 'completed'),
  (254, 144, '2024-2025', 'senior_highschool','Grade 11',    'STEM-A',    'STEM', '1st', 'completed'),
  (255, 145, '2024-2025', 'senior_highschool','Grade 11',    'STEM-A',    'STEM', '1st', 'completed'),
  (256, 146, '2024-2025', 'senior_highschool','Grade 11',    'STEM-B',    'STEM', '1st', 'completed'),
  -- SHS Grade 11 — 2025-2026 current
  (257, 147, '2025-2026', 'senior_highschool','Grade 11',    'STEM-A',    'STEM', '1st', 'enrolled'),
  (258, 148, '2025-2026', 'senior_highschool','Grade 11',    'STEM-B',    'STEM', '1st', 'enrolled'),
  (259, 149, '2025-2026', 'senior_highschool','Grade 11',    'STEM-A',    'STEM', '1st', 'enrolled'),
  -- SHS Grade 12 — 2024-2025 completed
  (260, 150, '2024-2025', 'senior_highschool','Grade 12',    'STEM-A',    'STEM', '1st', 'completed'),
  (261, 151, '2024-2025', 'senior_highschool','Grade 12',    'STEM-B',    'STEM', '1st', 'completed'),
  -- SHS Grade 12 — 2025-2026 current
  (262, 140, '2025-2026', 'senior_highschool','Grade 12',    'STEM-A',    'STEM', '1st', 'enrolled'),
  (263, 141, '2025-2026', 'senior_highschool','Grade 12',    'STEM-A',    'STEM', '1st', 'enrolled'),
  (264, 142, '2025-2026', 'senior_highschool','Grade 12',    'STEM-B',    'STEM', '1st', 'enrolled'),
  (265, 143, '2025-2026', 'senior_highschool','Grade 12',    'STEM-B',    'STEM', '1st', 'enrolled'),
  (266, 144, '2025-2026', 'senior_highschool','Grade 12',    'STEM-A',    'STEM', '1st', 'enrolled'),
  (267, 145, '2025-2026', 'senior_highschool','Grade 12',    'STEM-A',    'STEM', '1st', 'enrolled'),
  (268, 146, '2025-2026', 'senior_highschool','Grade 12',    'STEM-B',    'STEM', '1st', 'enrolled')
ON CONFLICT DO NOTHING;

-- =====================================================
-- USERS
-- Without these nobody can log in: the schema ships no rows and the README
-- documented no createsuperuser step, so a clean install produced a system
-- with no way in. Passwords are Django PBKDF2 hashes of 'SlisDemo2026!'.
-- CHANGE THESE BEFORE ANY DEPLOYMENT -- they are demo credentials, published
-- in the repo, and are only appropriate for a local evaluation copy.
-- =====================================================
INSERT INTO users (user_id, name, email, role, password)
OVERRIDING SYSTEM VALUE VALUES
  (1, 'System Administrator', 'superadmin@slis.test', 'super_admin', 'pbkdf2_sha256$1200000$Awywpt86nzezzKE544ZK9C$mdHq/AfP1gXjProkIbOlAVYAHW+ADNH7u0sEO3tKvVg='),
  (2, 'School Administrator', 'admin@slis.test',      'admin',       'pbkdf2_sha256$1200000$w1YJBCM8WVKq1n76785DWT$V/pdvTFxf7nlNv9Rl4GIlQd6WezfMmVu6YqBjOIrjxI='),
  (3, 'Registrar',            'registrar@slis.test',  'registrar',   'pbkdf2_sha256$1200000$yzMNi7tGSufZ8G9TQoyOHG$39stXhKajw8YaJVmm5vhpVfW0+zc/OiWwpXfr2OWrCU='),
  (4, 'Class Adviser',        'teacher@slis.test',    'teacher',     'pbkdf2_sha256$1200000$e2gDvoQBb0sQL8sUJ68pg7$oqQ8Y16lISVfyr5jCDTHPkZ68sM3lK3C8aHDH1HHxUY='),
  (5, 'Accounting Officer',   'accounting@slis.test', 'accounting',  'pbkdf2_sha256$1200000$MnheUmYtho5VXP0hnkOdnW$/u0WyEZKJ8zNlFThAK/HWFQNqFMXgOYX2jE8swmoeGc='),
  -- Guardian portal account. Without a role='guardian' user linked to a
  -- guardians row, /guardian is unreachable on a clean install -- there was
  -- no way to open the parent portal at all, which is why it had no test
  -- coverage. Linked to two children by the UPDATE further down.
  (6, 'Maribel Santos Reyes', 'maribel.reyes.seed@gmail.com', 'guardian', 'pbkdf2_sha256$1200000$8PhJ7C04i3bYIkCkx9fhsV$eFuB016SoQZFpdFgJuH5t1eb4BIZ9Mz0+bDneX4UFoM=')
ON CONFLICT DO NOTHING;

SELECT setval('users_user_id_seq', GREATEST((SELECT MAX(user_id) FROM users), 1));

-- =====================================================
-- GRADING TEMPLATES AND COMPONENTS
-- The score-entry block below looks up templates 2 and 3 by id, and every
-- subject points at one. Neither table was seeded, so the lookup returned
-- NULL and the NOT NULL on score_entries.grading_component_id aborted the
-- whole transaction.
--
-- Weights follow DepEd Order No. 8, s. 2015. Note this seed carries one
-- template per school level, not the full per-learning-area matrix the Order
-- defines (Languages/AP/EsP 30-50-20, Science and Math 40-40-20, MAPEH/TLE
-- 20-60-20, and the separate SHS Core/Academic/TVL splits) -- GradingTemplate
-- is keyed only on school_level, so that matrix cannot be expressed yet.
-- =====================================================
INSERT INTO grading_templates (grading_template_id, template_name, description, school_level, is_active)
OVERRIDING SYSTEM VALUE VALUES
  (1, 'Standard Kindergarten',     'Checkpoint-based, no quarterly assessment.',   'kindergarten',      TRUE),
  (2, 'Standard Elementary',       'DepEd Order 8 s.2015 weighting, elementary.',  'elementary',        TRUE),
  (3, 'Standard Junior High',      'DepEd Order 8 s.2015 weighting, junior high.', 'junior_highschool', TRUE),
  (4, 'Standard Senior High Core', 'DepEd Order 8 s.2015 weighting, SHS core.',    'senior_highschool', TRUE)
ON CONFLICT DO NOTHING;

SELECT setval('grading_templates_grading_template_id_seq', GREATEST((SELECT MAX(grading_template_id) FROM grading_templates), 1));

INSERT INTO grading_components (grading_component_id, grading_template_id, component_name, weight, sort_order)
OVERRIDING SYSTEM VALUE VALUES
  -- Kindergarten: no quarterly assessment.
  (1,  1, 'Written Works',        50.00, 1),
  (2,  1, 'Performance Tasks',    50.00, 2),
  -- Elementary: 30 / 50 / 20.
  (3,  2, 'Written Works',        30.00, 1),
  (4,  2, 'Performance Tasks',    50.00, 2),
  (5,  2, 'Quarterly Assessment', 20.00, 3),
  -- Junior high: 30 / 50 / 20.
  (6,  3, 'Written Works',        30.00, 1),
  (7,  3, 'Performance Tasks',    50.00, 2),
  (8,  3, 'Quarterly Assessment', 20.00, 3),
  -- Senior high core: 25 / 50 / 25.
  (9,  4, 'Written Works',        25.00, 1),
  (10, 4, 'Performance Tasks',    50.00, 2),
  (11, 4, 'Quarterly Assessment', 25.00, 3)
ON CONFLICT DO NOTHING;

SELECT setval('grading_components_grading_component_id_seq', GREATEST((SELECT MAX(grading_component_id) FROM grading_components), 1));

-- =====================================================
-- SUBJECTS
-- The grades block below references subject_id 1-20 by FK. This table was
-- never seeded, so the very first grades row violated
-- grades_subject_id_fkey and rolled the entire seed back.
-- =====================================================
INSERT INTO subjects (subject_id, subject_code, subject_name, school_level, grade_level, strand, semester, grading_template_id)
OVERRIDING SYSTEM VALUE VALUES
  -- Elementary Grade 4
  (1,  'FIL4',    'Filipino 4',             'elementary',        'Grade 4',  NULL,   NULL,  2),
  (2,  'ENG4',    'English 4',              'elementary',        'Grade 4',  NULL,   NULL,  2),
  (3,  'MATH4',   'Mathematics 4',          'elementary',        'Grade 4',  NULL,   NULL,  2),
  (4,  'SCI4',    'Science 4',              'elementary',        'Grade 4',  NULL,   NULL,  2),
  -- Elementary Grade 6
  (5,  'FIL6',    'Filipino 6',             'elementary',        'Grade 6',  NULL,   NULL,  2),
  (6,  'MATH6',   'Mathematics 6',          'elementary',        'Grade 6',  NULL,   NULL,  2),
  (7,  'SCI6',    'Science 6',              'elementary',        'Grade 6',  NULL,   NULL,  2),
  -- Junior High Grade 7
  (8,  'MATH7',   'Mathematics 7',          'junior_highschool', 'Grade 7',  NULL,   NULL,  3),
  (9,  'SCI7',    'Science 7',              'junior_highschool', 'Grade 7',  NULL,   NULL,  3),
  (10, 'ENG7',    'English 7',              'junior_highschool', 'Grade 7',  NULL,   NULL,  3),
  -- Junior High Grade 8
  (11, 'MATH8',   'Mathematics 8',          'junior_highschool', 'Grade 8',  NULL,   NULL,  3),
  (12, 'SCI8',    'Science 8',              'junior_highschool', 'Grade 8',  NULL,   NULL,  3),
  -- Junior High Grade 10
  (13, 'MATH10',  'Mathematics 10',         'junior_highschool', 'Grade 10', NULL,   NULL,  3),
  (14, 'SCI10',   'Science 10',             'junior_highschool', 'Grade 10', NULL,   NULL,  3),
  (15, 'ENG10',   'English 10',             'junior_highschool', 'Grade 10', NULL,   NULL,  3),
  -- Senior High Grade 11 (STEM, 1st semester)
  (16, 'GENMATH', 'General Mathematics',    'senior_highschool', 'Grade 11', 'STEM', '1st', 4),
  (17, 'EARTHLI', 'Earth and Life Science', 'senior_highschool', 'Grade 11', 'STEM', '1st', 4),
  (18, 'ORALCOM', 'Oral Communication',     'senior_highschool', 'Grade 11', 'STEM', '1st', 4),
  -- Senior High Grade 12 (STEM, 1st semester)
  (19, 'BUSFIN',  'Business Finance',       'senior_highschool', 'Grade 12', 'STEM', '1st', 4),
  (20, 'PR2',     'Practical Research 2',   'senior_highschool', 'Grade 12', 'STEM', '1st', 4)
ON CONFLICT DO NOTHING;

SELECT setval('subjects_subject_id_seq', GREATEST((SELECT MAX(subject_id) FROM subjects), 1));

-- =====================================================
-- GRADES
-- Existing subject IDs used:
--   Elem Grade 4:  Filipino 4=1, English 4=2, Math 4=3, Science 4=4
--   Elem Grade 6:  Filipino 6=5, Math 6=6, Science 6=7
--   JHS Grade 7:   Math 7=8, Science 7=9, English 7=10
--   JHS Grade 8:   Math 8=11, Science 8=12
--   JHS Grade 10:  Math 10=13, Science 10=14, English 10=15
--   SHS Grade 11:  Gen Math=16, Earth & Life=17, Oral Comm=18
--   SHS Grade 12:  Business Finance=19, Practical Research 2=20
-- =====================================================
INSERT INTO grades (enrollment_id, subject_id, grading_period, numeric_grade, remarks, recorded_at)
VALUES
-- === ELEMENTARY GRADE 4 — 2024-2025 (completed) ===
-- Enrollment 210 (Student 110, Bianca Soriano)
(210, 1, '1st_quarter', 87.00, 'passed', NOW()),
(210, 2, '1st_quarter', 83.00, 'passed', NOW()),
(210, 3, '1st_quarter', 91.00, 'passed', NOW()),
(210, 4, '1st_quarter', 79.00, 'passed', NOW()),
(210, 1, '2nd_quarter', 85.00, 'passed', NOW()),
(210, 2, '2nd_quarter', 81.00, 'passed', NOW()),
(210, 3, '2nd_quarter', 89.00, 'passed', NOW()),
(210, 4, '2nd_quarter', 77.00, 'passed', NOW()),
(210, 1, '3rd_quarter', 83.00, 'passed', NOW()),
(210, 2, '3rd_quarter', 79.00, 'passed', NOW()),
(210, 3, '3rd_quarter', 87.00, 'passed', NOW()),
(210, 4, '3rd_quarter', 75.00, 'passed', NOW()),
(210, 1, '4th_quarter', 89.00, 'passed', NOW()),
(210, 2, '4th_quarter', 85.00, 'passed', NOW()),
(210, 3, '4th_quarter', 93.00, 'passed', NOW()),
(210, 4, '4th_quarter', 81.00, 'passed', NOW()),
-- Enrollment 211 (Student 112, Kristine Mercado)
(211, 1, '1st_quarter', 78.00, 'passed', NOW()),
(211, 2, '1st_quarter', 75.00, 'passed', NOW()),
(211, 3, '1st_quarter', 82.00, 'passed', NOW()),
(211, 4, '1st_quarter', 72.00, 'failed', NOW()),
(211, 1, '2nd_quarter', 80.00, 'passed', NOW()),
(211, 2, '2nd_quarter', 77.00, 'passed', NOW()),
(211, 3, '2nd_quarter', 84.00, 'passed', NOW()),
(211, 4, '2nd_quarter', 74.00, 'failed', NOW()),
(211, 1, '3rd_quarter', 82.00, 'passed', NOW()),
(211, 2, '3rd_quarter', 79.00, 'passed', NOW()),
(211, 3, '3rd_quarter', 86.00, 'passed', NOW()),
(211, 4, '3rd_quarter', 76.00, 'passed', NOW()),
(211, 1, '4th_quarter', 84.00, 'passed', NOW()),
(211, 2, '4th_quarter', 81.00, 'passed', NOW()),
(211, 3, '4th_quarter', 88.00, 'passed', NOW()),
(211, 4, '4th_quarter', 78.00, 'passed', NOW()),
-- Enrollment 212 (Student 115, Patrick Jimenez)
(212, 1, '1st_quarter', 70.00, 'failed', NOW()),
(212, 2, '1st_quarter', 68.00, 'failed', NOW()),
(212, 3, '1st_quarter', 65.00, 'failed', NOW()),
(212, 4, '1st_quarter', 67.00, 'failed', NOW()),
(212, 1, '2nd_quarter', 73.00, 'failed', NOW()),
(212, 2, '2nd_quarter', 71.00, 'failed', NOW()),
(212, 3, '2nd_quarter', 69.00, 'failed', NOW()),
(212, 4, '2nd_quarter', 70.00, 'failed', NOW()),
(212, 1, '3rd_quarter', 76.00, 'passed', NOW()),
(212, 2, '3rd_quarter', 74.00, 'failed', NOW()),
(212, 3, '3rd_quarter', 72.00, 'failed', NOW()),
(212, 4, '3rd_quarter', 75.00, 'passed', NOW()),
(212, 1, '4th_quarter', 78.00, 'passed', NOW()),
(212, 2, '4th_quarter', 76.00, 'passed', NOW()),
(212, 3, '4th_quarter', 75.00, 'passed', NOW()),
(212, 4, '4th_quarter', 77.00, 'passed', NOW()),
-- === ELEMENTARY GRADE 4 — 2025-2026 (enrolled, Q1 only) ===
-- Enrollment 215 (Student 110)
(215, 1, '1st_quarter', 90.00, 'passed', NOW()),
(215, 2, '1st_quarter', 87.00, 'passed', NOW()),
(215, 3, '1st_quarter', 94.00, 'passed', NOW()),
(215, 4, '1st_quarter', 82.00, 'passed', NOW()),
-- Enrollment 216 (Student 112)
(216, 1, '1st_quarter', 81.00, 'passed', NOW()),
(216, 2, '1st_quarter', 78.00, 'passed', NOW()),
(216, 3, '1st_quarter', 85.00, 'passed', NOW()),
(216, 4, '1st_quarter', 76.00, 'passed', NOW()),
-- Enrollment 217 (Student 115)
(217, 1, '1st_quarter', 75.00, 'passed', NOW()),
(217, 2, '1st_quarter', 72.00, 'failed', NOW()),
(217, 3, '1st_quarter', 70.00, 'failed', NOW()),
(217, 4, '1st_quarter', 74.00, 'failed', NOW()),
-- === ELEMENTARY GRADE 6 — 2024-2025 (completed) ===
-- Enrollment 220 (Student 111, Marco Valdez)
(220, 5, '1st_quarter', 88.00, 'passed', NOW()),
(220, 6, '1st_quarter', 92.00, 'passed', NOW()),
(220, 7, '1st_quarter', 85.00, 'passed', NOW()),
(220, 5, '2nd_quarter', 86.00, 'passed', NOW()),
(220, 6, '2nd_quarter', 90.00, 'passed', NOW()),
(220, 7, '2nd_quarter', 83.00, 'passed', NOW()),
(220, 5, '3rd_quarter', 84.00, 'passed', NOW()),
(220, 6, '3rd_quarter', 88.00, 'passed', NOW()),
(220, 7, '3rd_quarter', 81.00, 'passed', NOW()),
(220, 5, '4th_quarter', 90.00, 'passed', NOW()),
(220, 6, '4th_quarter', 94.00, 'passed', NOW()),
(220, 7, '4th_quarter', 87.00, 'passed', NOW()),
-- Enrollment 222 (Student 114, Jasmine Dizon)
(222, 5, '1st_quarter', 95.00, 'passed', NOW()),
(222, 6, '1st_quarter', 97.00, 'passed', NOW()),
(222, 7, '1st_quarter', 93.00, 'passed', NOW()),
(222, 5, '2nd_quarter', 93.00, 'passed', NOW()),
(222, 6, '2nd_quarter', 96.00, 'passed', NOW()),
(222, 7, '2nd_quarter', 91.00, 'passed', NOW()),
(222, 5, '3rd_quarter', 94.00, 'passed', NOW()),
(222, 6, '3rd_quarter', 98.00, 'passed', NOW()),
(222, 7, '3rd_quarter', 92.00, 'passed', NOW()),
(222, 5, '4th_quarter', 96.00, 'passed', NOW()),
(222, 6, '4th_quarter', 98.00, 'passed', NOW()),
(222, 7, '4th_quarter', 95.00, 'passed', NOW()),
-- Enrollment 224 (Student 119, Kevin Perez — struggling)
(224, 5, '1st_quarter', 73.00, 'failed', NOW()),
(224, 6, '1st_quarter', 70.00, 'failed', NOW()),
(224, 7, '1st_quarter', 68.00, 'failed', NOW()),
(224, 5, '2nd_quarter', 76.00, 'passed', NOW()),
(224, 6, '2nd_quarter', 73.00, 'failed', NOW()),
(224, 7, '2nd_quarter', 71.00, 'failed', NOW()),
(224, 5, '3rd_quarter', 78.00, 'passed', NOW()),
(224, 6, '3rd_quarter', 76.00, 'passed', NOW()),
(224, 7, '3rd_quarter', 74.00, 'failed', NOW()),
(224, 5, '4th_quarter', 80.00, 'passed', NOW()),
(224, 6, '4th_quarter', 78.00, 'passed', NOW()),
(224, 7, '4th_quarter', 76.00, 'passed', NOW()),
-- === ELEMENTARY GRADE 6 — 2025-2026 (Q1 only) ===
(227, 5, '1st_quarter', 91.00, 'passed', NOW()),
(227, 6, '1st_quarter', 95.00, 'passed', NOW()),
(227, 7, '1st_quarter', 88.00, 'passed', NOW()),
(228, 5, '1st_quarter', 96.00, 'passed', NOW()),
(228, 6, '1st_quarter', 98.00, 'passed', NOW()),
(228, 7, '1st_quarter', 94.00, 'passed', NOW()),
(229, 5, '1st_quarter', 77.00, 'passed', NOW()),
(229, 6, '1st_quarter', 75.00, 'passed', NOW()),
(229, 7, '1st_quarter', 73.00, 'failed', NOW()),
-- === JHS GRADE 7 — 2024-2025 (completed) ===
-- Enrollment 231 (Student 125, Joshua Medina)
(231, 8,  '1st_quarter', 85.00, 'passed', NOW()),
(231, 9,  '1st_quarter', 82.00, 'passed', NOW()),
(231, 10, '1st_quarter', 88.00, 'passed', NOW()),
(231, 8,  '2nd_quarter', 87.00, 'passed', NOW()),
(231, 9,  '2nd_quarter', 84.00, 'passed', NOW()),
(231, 10, '2nd_quarter', 90.00, 'passed', NOW()),
(231, 8,  '3rd_quarter', 83.00, 'passed', NOW()),
(231, 9,  '3rd_quarter', 80.00, 'passed', NOW()),
(231, 10, '3rd_quarter', 86.00, 'passed', NOW()),
(231, 8,  '4th_quarter', 89.00, 'passed', NOW()),
(231, 9,  '4th_quarter', 86.00, 'passed', NOW()),
(231, 10, '4th_quarter', 92.00, 'passed', NOW()),
-- Enrollment 232 (Student 127, Mark Navarro)
(232, 8,  '1st_quarter', 76.00, 'passed', NOW()),
(232, 9,  '1st_quarter', 73.00, 'failed', NOW()),
(232, 10, '1st_quarter', 79.00, 'passed', NOW()),
(232, 8,  '2nd_quarter', 78.00, 'passed', NOW()),
(232, 9,  '2nd_quarter', 75.00, 'passed', NOW()),
(232, 10, '2nd_quarter', 81.00, 'passed', NOW()),
(232, 8,  '3rd_quarter', 80.00, 'passed', NOW()),
(232, 9,  '3rd_quarter', 77.00, 'passed', NOW()),
(232, 10, '3rd_quarter', 83.00, 'passed', NOW()),
(232, 8,  '4th_quarter', 82.00, 'passed', NOW()),
(232, 9,  '4th_quarter', 79.00, 'passed', NOW()),
(232, 10, '4th_quarter', 85.00, 'passed', NOW()),
-- === JHS GRADE 7 — 2025-2026 (Q1 only) ===
(236, 8,  '1st_quarter', 86.00, 'passed', NOW()),
(236, 9,  '1st_quarter', 83.00, 'passed', NOW()),
(236, 10, '1st_quarter', 89.00, 'passed', NOW()),
(237, 8,  '1st_quarter', 77.00, 'passed', NOW()),
(237, 9,  '1st_quarter', 74.00, 'failed', NOW()),
(237, 10, '1st_quarter', 80.00, 'passed', NOW()),
(238, 8,  '1st_quarter', 82.00, 'passed', NOW()),
(238, 9,  '1st_quarter', 79.00, 'passed', NOW()),
(238, 10, '1st_quarter', 85.00, 'passed', NOW()),
-- === JHS GRADE 8 — 2025-2026 (Q1 only) ===
(241, 11, '1st_quarter', 88.00, 'passed', NOW()),
(241, 12, '1st_quarter', 84.00, 'passed', NOW()),
(242, 11, '1st_quarter', 79.00, 'passed', NOW()),
(242, 12, '1st_quarter', 76.00, 'passed', NOW()),
(243, 11, '1st_quarter', 83.00, 'passed', NOW()),
(243, 12, '1st_quarter', 80.00, 'passed', NOW()),
(244, 11, '1st_quarter', 72.00, 'failed', NOW()),
(244, 12, '1st_quarter', 70.00, 'failed', NOW()),
-- === JHS GRADE 10 — 2025-2026 (Q1 only) ===
(245, 13, '1st_quarter', 90.00, 'passed', NOW()),
(245, 14, '1st_quarter', 87.00, 'passed', NOW()),
(245, 15, '1st_quarter', 93.00, 'passed', NOW()),
(246, 13, '1st_quarter', 76.00, 'passed', NOW()),
(246, 14, '1st_quarter', 73.00, 'failed', NOW()),
(246, 15, '1st_quarter', 79.00, 'passed', NOW()),
(247, 13, '1st_quarter', 85.00, 'passed', NOW()),
(247, 14, '1st_quarter', 82.00, 'passed', NOW()),
(247, 15, '1st_quarter', 88.00, 'passed', NOW()),
(248, 13, '1st_quarter', 92.00, 'passed', NOW()),
(248, 14, '1st_quarter', 89.00, 'passed', NOW()),
(248, 15, '1st_quarter', 95.00, 'passed', NOW()),
(249, 13, '1st_quarter', 70.00, 'failed', NOW()),
(249, 14, '1st_quarter', 68.00, 'failed', NOW()),
(249, 15, '1st_quarter', 73.00, 'failed', NOW()),
-- === SHS GRADE 11 — 2024-2025 (completed) ===
-- Enrollment 250 (Student 140, Andrea Lagman)
(250, 16, '1st_semester', 92.00, 'passed', NOW()),
(250, 17, '1st_semester', 88.00, 'passed', NOW()),
(250, 18, '1st_semester', 90.00, 'passed', NOW()),
(250, 16, '2nd_semester', 91.00, 'passed', NOW()),
(250, 17, '2nd_semester', 87.00, 'passed', NOW()),
(250, 18, '2nd_semester', 89.00, 'passed', NOW()),
-- Enrollment 252 (Student 142, Francesca Dizon — top)
(252, 16, '1st_semester', 97.00, 'passed', NOW()),
(252, 17, '1st_semester', 95.00, 'passed', NOW()),
(252, 18, '1st_semester', 98.00, 'passed', NOW()),
(252, 16, '2nd_semester', 96.00, 'passed', NOW()),
(252, 17, '2nd_semester', 94.00, 'passed', NOW()),
(252, 18, '2nd_semester', 97.00, 'passed', NOW()),
-- Enrollment 254 (Student 144, Samantha Marquez — struggling)
(254, 16, '1st_semester', 72.00, 'failed', NOW()),
(254, 17, '1st_semester', 70.00, 'failed', NOW()),
(254, 18, '1st_semester', 74.00, 'failed', NOW()),
(254, 16, '2nd_semester', 76.00, 'passed', NOW()),
(254, 17, '2nd_semester', 75.00, 'passed', NOW()),
(254, 18, '2nd_semester', 77.00, 'passed', NOW()),
-- === SHS GRADE 12 — 2024-2025 completed (Student 150 graduated) ===
(260, 19, '1st_semester', 94.00, 'passed', NOW()),
(260, 20, '1st_semester', 92.00, 'passed', NOW()),
(260, 19, '2nd_semester', 95.00, 'passed', NOW()),
(260, 20, '2nd_semester', 93.00, 'passed', NOW()),
(261, 19, '1st_semester', 88.00, 'passed', NOW()),
(261, 20, '1st_semester', 85.00, 'passed', NOW()),
(261, 19, '2nd_semester', 90.00, 'passed', NOW()),
(261, 20, '2nd_semester', 87.00, 'passed', NOW()),
-- === SHS GRADE 12 — 2025-2026 (1st sem only) ===
(262, 19, '1st_semester', 91.00, 'passed', NOW()),
(262, 20, '1st_semester', 88.00, 'passed', NOW()),
(263, 19, '1st_semester', 85.00, 'passed', NOW()),
(263, 20, '1st_semester', 82.00, 'passed', NOW()),
(264, 19, '1st_semester', 96.00, 'passed', NOW()),
(264, 20, '1st_semester', 95.00, 'passed', NOW()),
(265, 19, '1st_semester', 79.00, 'passed', NOW()),
(265, 20, '1st_semester', 77.00, 'passed', NOW()),
(266, 19, '1st_semester', 75.00, 'passed', NOW()),
(266, 20, '1st_semester', 73.00, 'failed', NOW()),
(267, 19, '1st_semester', 88.00, 'passed', NOW()),
(267, 20, '1st_semester', 86.00, 'passed', NOW()),
(268, 19, '1st_semester', 92.00, 'passed', NOW()),
(268, 20, '1st_semester', 90.00, 'passed', NOW())
ON CONFLICT (enrollment_id, subject_id, grading_period) DO NOTHING;

-- =====================================================
-- SCORE ENTRIES
-- Looks up component IDs by name from actual DB data
-- =====================================================
DO $$
DECLARE
  ww_elem  BIGINT;  pt_elem  BIGINT;
  ww_jhs   BIGINT;  pt_jhs   BIGINT;  qa_jhs   BIGINT;
BEGIN
  -- Template 2 = Standard Elementary, Template 3 = Standard JHS
  SELECT grading_component_id INTO ww_elem FROM grading_components WHERE grading_template_id = 2 AND component_name = 'Written Works'       LIMIT 1;
  SELECT grading_component_id INTO pt_elem FROM grading_components WHERE grading_template_id = 2 AND component_name = 'Performance Tasks'   LIMIT 1;
  SELECT grading_component_id INTO ww_jhs  FROM grading_components WHERE grading_template_id = 3 AND component_name = 'Written Works'       LIMIT 1;
  SELECT grading_component_id INTO pt_jhs  FROM grading_components WHERE grading_template_id = 3 AND component_name = 'Performance Tasks'   LIMIT 1;
  SELECT grading_component_id INTO qa_jhs  FROM grading_components WHERE grading_template_id = 3 AND component_name = 'Quarterly Assessment' LIMIT 1;

  -- Enrollment 210, Subject 3 (Math 4) — Elementary
  INSERT INTO score_entries (enrollment_id, subject_id, grading_component_id, grading_period, label, score, max_score, recorded_at)
  VALUES
    (210, 3, ww_elem, '1st_quarter', 'Written Work 1',     37.00, 40.00, NOW()),
    (210, 3, ww_elem, '1st_quarter', 'Written Work 2',     36.00, 40.00, NOW()),
    (210, 3, pt_elem, '1st_quarter', 'Performance Task 1', 56.00, 60.00, NOW()),
    (210, 3, ww_elem, '2nd_quarter', 'Written Work 1',     35.00, 40.00, NOW()),
    (210, 3, ww_elem, '2nd_quarter', 'Written Work 2',     34.00, 40.00, NOW()),
    (210, 3, pt_elem, '2nd_quarter', 'Performance Task 1', 55.00, 60.00, NOW()),
    (210, 3, ww_elem, '3rd_quarter', 'Written Work 1',     34.00, 40.00, NOW()),
    (210, 3, ww_elem, '3rd_quarter', 'Written Work 2',     33.00, 40.00, NOW()),
    (210, 3, pt_elem, '3rd_quarter', 'Performance Task 1', 54.00, 60.00, NOW()),
    (210, 3, ww_elem, '4th_quarter', 'Written Work 1',     38.00, 40.00, NOW()),
    (210, 3, ww_elem, '4th_quarter', 'Written Work 2',     37.00, 40.00, NOW()),
    (210, 3, pt_elem, '4th_quarter', 'Performance Task 1', 58.00, 60.00, NOW())
  ON CONFLICT DO NOTHING;

  -- Enrollment 212, Subject 3 (Math 4 — struggling student Patrick)
  INSERT INTO score_entries (enrollment_id, subject_id, grading_component_id, grading_period, label, score, max_score, recorded_at)
  VALUES
    (212, 3, ww_elem, '1st_quarter', 'Written Work 1',     24.00, 40.00, NOW()),
    (212, 3, ww_elem, '1st_quarter', 'Written Work 2',     23.00, 40.00, NOW()),
    (212, 3, pt_elem, '1st_quarter', 'Performance Task 1', 41.00, 60.00, NOW()),
    (212, 3, ww_elem, '2nd_quarter', 'Written Work 1',     26.00, 40.00, NOW()),
    (212, 3, ww_elem, '2nd_quarter', 'Written Work 2',     25.00, 40.00, NOW()),
    (212, 3, pt_elem, '2nd_quarter', 'Performance Task 1', 42.00, 60.00, NOW()),
    (212, 3, ww_elem, '3rd_quarter', 'Written Work 1',     28.00, 40.00, NOW()),
    (212, 3, ww_elem, '3rd_quarter', 'Written Work 2',     27.00, 40.00, NOW()),
    (212, 3, pt_elem, '3rd_quarter', 'Performance Task 1', 44.00, 60.00, NOW()),
    (212, 3, ww_elem, '4th_quarter', 'Written Work 1',     29.00, 40.00, NOW()),
    (212, 3, ww_elem, '4th_quarter', 'Written Work 2',     28.00, 40.00, NOW()),
    (212, 3, pt_elem, '4th_quarter', 'Performance Task 1', 46.00, 60.00, NOW())
  ON CONFLICT DO NOTHING;

  -- Enrollment 222, Subject 6 (Math 6 — top student Jasmine)
  INSERT INTO score_entries (enrollment_id, subject_id, grading_component_id, grading_period, label, score, max_score, recorded_at)
  VALUES
    (222, 6, ww_elem, '1st_quarter', 'Written Work 1',     40.00, 40.00, NOW()),
    (222, 6, ww_elem, '1st_quarter', 'Written Work 2',     39.00, 40.00, NOW()),
    (222, 6, pt_elem, '1st_quarter', 'Performance Task 1', 59.00, 60.00, NOW()),
    (222, 6, ww_elem, '2nd_quarter', 'Written Work 1',     39.00, 40.00, NOW()),
    (222, 6, ww_elem, '2nd_quarter', 'Written Work 2',     38.00, 40.00, NOW()),
    (222, 6, pt_elem, '2nd_quarter', 'Performance Task 1', 58.00, 60.00, NOW()),
    (222, 6, ww_elem, '3rd_quarter', 'Written Work 1',     40.00, 40.00, NOW()),
    (222, 6, ww_elem, '3rd_quarter', 'Written Work 2',     39.00, 40.00, NOW()),
    (222, 6, pt_elem, '3rd_quarter', 'Performance Task 1', 59.00, 60.00, NOW()),
    (222, 6, ww_elem, '4th_quarter', 'Written Work 1',     40.00, 40.00, NOW()),
    (222, 6, ww_elem, '4th_quarter', 'Written Work 2',     40.00, 40.00, NOW()),
    (222, 6, pt_elem, '4th_quarter', 'Performance Task 1', 59.00, 60.00, NOW())
  ON CONFLICT DO NOTHING;

  -- Enrollment 231, Subject 8 (Math 7 — JHS)
  INSERT INTO score_entries (enrollment_id, subject_id, grading_component_id, grading_period, label, score, max_score, recorded_at)
  VALUES
    (231, 8, ww_jhs, '1st_quarter', 'Written Work 1',      22.00, 25.00, NOW()),
    (231, 8, ww_jhs, '1st_quarter', 'Written Work 2',      21.00, 25.00, NOW()),
    (231, 8, pt_jhs, '1st_quarter', 'Performance Task 1',  44.00, 50.00, NOW()),
    (231, 8, qa_jhs, '1st_quarter', 'Quarterly Assessment',22.00, 25.00, NOW()),
    (231, 8, ww_jhs, '2nd_quarter', 'Written Work 1',      23.00, 25.00, NOW()),
    (231, 8, ww_jhs, '2nd_quarter', 'Written Work 2',      22.00, 25.00, NOW()),
    (231, 8, pt_jhs, '2nd_quarter', 'Performance Task 1',  46.00, 50.00, NOW()),
    (231, 8, qa_jhs, '2nd_quarter', 'Quarterly Assessment',23.00, 25.00, NOW()),
    (231, 8, ww_jhs, '3rd_quarter', 'Written Work 1',      21.00, 25.00, NOW()),
    (231, 8, ww_jhs, '3rd_quarter', 'Written Work 2',      20.00, 25.00, NOW()),
    (231, 8, pt_jhs, '3rd_quarter', 'Performance Task 1',  43.00, 50.00, NOW()),
    (231, 8, qa_jhs, '3rd_quarter', 'Quarterly Assessment',21.00, 25.00, NOW()),
    (231, 8, ww_jhs, '4th_quarter', 'Written Work 1',      24.00, 25.00, NOW()),
    (231, 8, ww_jhs, '4th_quarter', 'Written Work 2',      23.00, 25.00, NOW()),
    (231, 8, pt_jhs, '4th_quarter', 'Performance Task 1',  47.00, 50.00, NOW()),
    (231, 8, qa_jhs, '4th_quarter', 'Quarterly Assessment',23.00, 25.00, NOW())
  ON CONFLICT DO NOTHING;

  -- Enrollment 245, Subject 13 (Math 10 — top JHS student Natasha)
  INSERT INTO score_entries (enrollment_id, subject_id, grading_component_id, grading_period, label, score, max_score, recorded_at)
  VALUES
    (245, 13, ww_jhs, '1st_quarter', 'Written Work 1',      24.00, 25.00, NOW()),
    (245, 13, ww_jhs, '1st_quarter', 'Written Work 2',      23.00, 25.00, NOW()),
    (245, 13, pt_jhs, '1st_quarter', 'Performance Task 1',  47.00, 50.00, NOW()),
    (245, 13, qa_jhs, '1st_quarter', 'Quarterly Assessment',24.00, 25.00, NOW())
  ON CONFLICT DO NOTHING;

  -- Enrollment 249, Subject 13 (Math 10 — struggling student Brandon)
  INSERT INTO score_entries (enrollment_id, subject_id, grading_component_id, grading_period, label, score, max_score, recorded_at)
  VALUES
    (249, 13, ww_jhs, '1st_quarter', 'Written Work 1',      17.00, 25.00, NOW()),
    (249, 13, ww_jhs, '1st_quarter', 'Written Work 2',      16.00, 25.00, NOW()),
    (249, 13, pt_jhs, '1st_quarter', 'Performance Task 1',  36.00, 50.00, NOW()),
    (249, 13, qa_jhs, '1st_quarter', 'Quarterly Assessment',17.00, 25.00, NOW())
  ON CONFLICT DO NOTHING;

END $$;

-- =====================================================
-- RESET SEQUENCES
-- =====================================================
SELECT setval(pg_get_serial_sequence('households',    'household_id'),    (SELECT MAX(household_id)    FROM households));
SELECT setval(pg_get_serial_sequence('students',      'student_id'),      (SELECT MAX(student_id)      FROM students));
SELECT setval(pg_get_serial_sequence('enrollments',   'enrollment_id'),   (SELECT MAX(enrollment_id)   FROM enrollments));
SELECT setval(pg_get_serial_sequence('grades',        'grade_id'),        (SELECT MAX(grade_id)        FROM grades));
SELECT setval(pg_get_serial_sequence('score_entries', 'score_entry_id'),  (SELECT MAX(score_entry_id)  FROM score_entries));

-- =====================================================
-- ATTENDANCE RECORDS
-- attendance_records(attendance_id serial, enrollment_id, date, status, remarks, recorded_by, ...)
-- One row per (enrollment_id, date) — unique_together constraint.
-- Status: P=present, A=absent, L=late, E=excused.
-- Covers the same 2025-2026 "current" enrollments already used for
-- grades/score_entries above, 10 school days (Aug 4-15, 2025, two
-- school weeks) per student, with a mix of statuses per student
-- profile (e.g. enrollment 249 = struggling student gets more
-- absences/lates, matching their weaker score_entries above).
-- =====================================================
INSERT INTO attendance_records (enrollment_id, date, status, remarks, recorded_by, created_at, updated_at)
SELECT enrollment_id, att_date::date, status, remarks, recorded_by::int, NOW(), NOW() FROM (VALUES
  -- Enrollment 215 (Elementary G4 Bianca, current year)
  (215, '2025-08-04', 'P', NULL, NULL),
  (215, '2025-08-05', 'P', NULL, NULL),
  (215, '2025-08-06', 'P', NULL, NULL),
  (215, '2025-08-07', 'L', 'Arrived 15 minutes late', NULL),
  (215, '2025-08-08', 'P', NULL, NULL),
  (215, '2025-08-11', 'P', NULL, NULL),
  (215, '2025-08-12', 'P', NULL, NULL),
  (215, '2025-08-13', 'P', NULL, NULL),
  (215, '2025-08-14', 'P', NULL, NULL),
  (215, '2025-08-15', 'P', NULL, NULL),
  -- Enrollment 219 (Elementary G4 struggling profile)
  (219, '2025-08-04', 'P', NULL, NULL),
  (219, '2025-08-05', 'A', 'No excuse letter submitted', NULL),
  (219, '2025-08-06', 'P', NULL, NULL),
  (219, '2025-08-07', 'L', 'Arrived 20 minutes late', NULL),
  (219, '2025-08-08', 'P', NULL, NULL),
  (219, '2025-08-11', 'A', 'No excuse letter submitted', NULL),
  (219, '2025-08-12', 'P', NULL, NULL),
  (219, '2025-08-13', 'L', 'Arrived 10 minutes late', NULL),
  (219, '2025-08-14', 'P', NULL, NULL),
  (219, '2025-08-15', 'P', NULL, NULL),
  -- Enrollment 227 (Elementary G6, top student profile)
  (227, '2025-08-04', 'P', NULL, NULL),
  (227, '2025-08-05', 'P', NULL, NULL),
  (227, '2025-08-06', 'P', NULL, NULL),
  (227, '2025-08-07', 'P', NULL, NULL),
  (227, '2025-08-08', 'P', NULL, NULL),
  (227, '2025-08-11', 'P', NULL, NULL),
  (227, '2025-08-12', 'P', NULL, NULL),
  (227, '2025-08-13', 'P', NULL, NULL),
  (227, '2025-08-14', 'P', NULL, NULL),
  (227, '2025-08-15', 'P', NULL, NULL),
  -- Enrollment 236 (JHS Grade 7)
  (236, '2025-08-04', 'P', NULL, NULL),
  (236, '2025-08-05', 'P', NULL, NULL),
  (236, '2025-08-06', 'E', 'Medical appointment, excused', NULL),
  (236, '2025-08-07', 'P', NULL, NULL),
  (236, '2025-08-08', 'P', NULL, NULL),
  (236, '2025-08-11', 'P', NULL, NULL),
  (236, '2025-08-12', 'L', 'Arrived 5 minutes late', NULL),
  (236, '2025-08-13', 'P', NULL, NULL),
  (236, '2025-08-14', 'P', NULL, NULL),
  (236, '2025-08-15', 'P', NULL, NULL),
  -- Enrollment 245 (JHS Grade 10, top student Natasha)
  (245, '2025-08-04', 'P', NULL, NULL),
  (245, '2025-08-05', 'P', NULL, NULL),
  (245, '2025-08-06', 'P', NULL, NULL),
  (245, '2025-08-07', 'P', NULL, NULL),
  (245, '2025-08-08', 'P', NULL, NULL),
  (245, '2025-08-11', 'P', NULL, NULL),
  (245, '2025-08-12', 'P', NULL, NULL),
  (245, '2025-08-13', 'P', NULL, NULL),
  (245, '2025-08-14', 'P', NULL, NULL),
  (245, '2025-08-15', 'P', NULL, NULL),
  -- Enrollment 249 (JHS Grade 10, struggling student Brandon — matches weaker score_entries above)
  (249, '2025-08-04', 'A', 'No excuse letter submitted', NULL),
  (249, '2025-08-05', 'P', NULL, NULL),
  (249, '2025-08-06', 'L', 'Arrived 25 minutes late', NULL),
  (249, '2025-08-07', 'A', 'No excuse letter submitted', NULL),
  (249, '2025-08-08', 'P', NULL, NULL),
  (249, '2025-08-11', 'L', 'Arrived 15 minutes late', NULL),
  (249, '2025-08-12', 'P', NULL, NULL),
  (249, '2025-08-13', 'A', 'No excuse letter submitted', NULL),
  (249, '2025-08-14', 'P', NULL, NULL),
  (249, '2025-08-15', 'L', 'Arrived 10 minutes late', NULL),
  -- Enrollment 257 (SHS Grade 11)
  (257, '2025-08-04', 'P', NULL, NULL),
  (257, '2025-08-05', 'P', NULL, NULL),
  (257, '2025-08-06', 'P', NULL, NULL),
  (257, '2025-08-07', 'L', 'Arrived 10 minutes late', NULL),
  (257, '2025-08-08', 'P', NULL, NULL),
  (257, '2025-08-11', 'P', NULL, NULL),
  (257, '2025-08-12', 'P', NULL, NULL),
  (257, '2025-08-13', 'P', NULL, NULL),
  (257, '2025-08-14', 'E', 'Family emergency, excused', NULL),
  (257, '2025-08-15', 'P', NULL, NULL),
  -- Enrollment 262 (SHS Grade 12)
  (262, '2025-08-04', 'P', NULL, NULL),
  (262, '2025-08-05', 'P', NULL, NULL),
  (262, '2025-08-06', 'P', NULL, NULL),
  (262, '2025-08-07', 'P', NULL, NULL),
  (262, '2025-08-08', 'P', NULL, NULL),
  (262, '2025-08-11', 'P', NULL, NULL),
  (262, '2025-08-12', 'P', NULL, NULL),
  (262, '2025-08-13', 'P', NULL, NULL),
  (262, '2025-08-14', 'P', NULL, NULL),
  (262, '2025-08-15', 'P', NULL, NULL)
) AS v(enrollment_id, att_date, status, remarks, recorded_by)
ON CONFLICT (enrollment_id, date) DO NOTHING;

SELECT setval(pg_get_serial_sequence('attendance_records', 'attendance_id'), (SELECT MAX(attendance_id) FROM attendance_records));

-- =====================================================
-- NARRATIVE REPORTS
-- narrative_categories is a blank admin-managed lookup table with no
-- existing rows, so we seed a minimal starter set first (IDs 900+ to
-- avoid colliding with anything created via the admin portal), then
-- narrative_reports referencing them (IDs 900+) for the same
-- current-year enrollments used above. grading_period follows each
-- enrollment's own school_level convention (quarters for
-- elementary/JHS, semesters for SHS) since the schema does not
-- enforce this itself.
-- =====================================================
-- The four core values of the DepEd Order No. 8, s. 2015 Report on Learner's
-- Observed Values. These are mandated categories, not a starter set: the
-- previous seed invented 'Social Skills' / 'Work Habits' / 'Areas for Growth',
-- which a registrar would not recognise on a report card.
INSERT INTO narrative_categories (category_id, name, description, sort_order, is_active)
OVERRIDING SYSTEM VALUE VALUES
  (900, 'Maka-Diyos',      'Expresses spiritual beliefs while respecting the beliefs of others.',      1, TRUE),
  (901, 'Makatao',         'Is sensitive to individual, social and cultural differences.',             2, TRUE),
  (902, 'Makakalikasan',   'Cares for the environment and utilises resources wisely and responsibly.', 3, TRUE),
  (903, 'Makabansa',       'Demonstrates pride in being a Filipino; exercises the rights and responsibilities of a Filipino citizen.', 4, TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO narrative_reports (report_id, enrollment_id, category_id, grading_period, rating, recorded_at)
OVERRIDING SYSTEM VALUE VALUES
  -- Enrollment 215 (Elementary G4)
  (900, 215, 900, '1st_quarter', 'AO', NOW()),
  (901, 215, 901, '1st_quarter', 'SO', NOW()),
  -- Enrollment 219 (Elementary G4, struggling profile)
  (902, 219, 901, '1st_quarter', 'RO', NOW()),
  (903, 219, 902, '1st_quarter', 'RO', NOW()),
  -- Enrollment 227 (Elementary G6, top student)
  (904, 227, 900, '1st_quarter', 'AO', NOW()),
  (905, 227, 901, '1st_quarter', 'AO', NOW()),
  -- Enrollment 236 (JHS Grade 7)
  (906, 236, 900, '1st_quarter', 'SO', NOW()),
  (907, 236, 901, '1st_quarter', 'SO', NOW()),
  -- Enrollment 245 (JHS Grade 10, top student Natasha)
  (908, 245, 900, '1st_quarter', 'AO', NOW()),
  (909, 245, 901, '1st_quarter', 'AO', NOW()),
  -- Enrollment 249 (JHS Grade 10, struggling student Brandon)
  (910, 249, 901, '1st_quarter', 'RO', NOW()),
  (911, 249, 902, '1st_quarter', 'RO', NOW()),
  -- Enrollment 257 (SHS Grade 11 — semester period, not quarter)
  (912, 257, 900, '1st_semester', 'SO', NOW()),
  (913, 257, 901, '1st_semester', 'SO', NOW()),
  -- Enrollment 262 (SHS Grade 12 — semester period, not quarter)
  (914, 262, 900, '1st_semester', 'AO', NOW()),
  (915, 262, 901, '1st_semester', 'AO', NOW())
ON CONFLICT (enrollment_id, category_id, grading_period) DO NOTHING;

-- =====================================================
-- SCHOOL SETTINGS
-- =====================================================
-- Singleton row. The schema shipped none, so /api/school-settings/current/
-- returned 404 and every caller fell back to its hardcoded default: the
-- letterhead on SF1/SF2/SF9/SF10/CoR printed a blank school address, and
-- SchoolYearContext derived the active school year from the calendar date
-- instead of reading it from here. Seeding it makes both observable.
INSERT INTO school_settings (
  setting_id, current_school_year, sy_start_date, sy_end_date, early_bird_days,
  school_name, school_address, contact_email, contact_phone
) OVERRIDING SYSTEM VALUE VALUES
  (1, '2025-2026', '2025-06-16', '2026-03-31', 7,
   'South Lakes Integrated School',
   '12 Lakeview Road, Brgy. San Isidro, Marikina City, Metro Manila 1800',
   'registrar@slis.test', '(02) 8123-4567')
ON CONFLICT DO NOTHING;

SELECT setval('school_settings_setting_id_seq', GREATEST((SELECT MAX(setting_id) FROM school_settings), 1));

COMMIT;
