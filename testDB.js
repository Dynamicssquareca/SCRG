const mongoose = require('mongoose');
const { Case } = require('./server/src/models/Case');
require('dotenv').config({ path: './server/.env' });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const cases = await Case.find({
    created_on: { $gte: new Date('2026-03-30'), $lte: new Date('2026-04-03') }
  }, 'case_number created_on');
  console.log(cases);
  process.exit(0);
}
run();

//fddfdsusil
