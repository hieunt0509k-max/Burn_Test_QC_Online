// migrate_sample_v2.js
const database = require('./database/database');
const p = database.prepare ? database.prepare.bind(database) : database.db.prepare.bind(database.db);

console.log('🔧 Migrate sample_burn_tests...');
const cols = p("PRAGMA table_info(sample_burn_tests)").all().map(c => c.name);

const addCol = (name, sql) => {
  if(cols.includes(name)){ console.log(`  • ${name}: đã có`); return; }
  p(`ALTER TABLE sample_burn_tests ADD COLUMN ${sql}`).run();
  console.log(`  ✓ Đã thêm ${name}`);
};

addCol('start_datetime',  'start_datetime TEXT');
addCol('end_datetime',    'end_datetime TEXT');
addCol('total_burn_time', 'total_burn_time TEXT');
addCol('test_result',     "test_result TEXT DEFAULT 'PENDING'");
addCol('tester',          'tester TEXT');
addCol('approved',        'approved TEXT');

console.log('\n✅ Migrate xong. Restart server.');
process.exit(0);