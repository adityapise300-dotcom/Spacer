// Wipes the database and inserts sample data.  Run with: npm run seed
process.env.TZ = 'Asia/Kolkata';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const ParkingZone = require('../models/ParkingZone');
const Slot = require('../models/Slot');
const Booking = require('../models/Booking');
const Transaction = require('../models/Transaction');
const { makeRef } = require('../services/paymentService');
const { owners, users, zones } = require('./data');

const PREFIX = { car: 'C', suv: 'S', bike: 'B', ev: 'E' };
const HOUR = 36e5;

async function run() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI missing. Copy .env.example to .env first.');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected. Clearing old data...');
  await Promise.all([User, ParkingZone, Slot, Booking, Transaction].map((m) => m.deleteMany({})));
  await mongoose.connection.collection('sessions').deleteMany({}).catch(() => {});

  const hash = (pw) => bcrypt.hash(pw, 10);
  const ownerDocs = await User.insertMany(
    await Promise.all(owners.map(async (o) => ({ name: o.name, email: o.email, phone: o.phone, role: 'owner', businessName: o.businessName, passwordHash: await hash(o.password) })))
  );
  const userDocs = await User.insertMany(
    await Promise.all(users.map(async (u) => ({ name: u.name, email: u.email, phone: u.phone, role: 'user', vehicles: u.vehicles, passwordHash: await hash(u.password) })))
  );

  const zoneDocs = [];
  for (const z of zones) {
    const zone = await ParkingZone.create({
      owner: ownerDocs[z.owner]._id, name: z.name, description: z.description, address: z.address, city: 'Pune',
      category: z.category, location: { type: 'Point', coordinates: z.coordinates },
      vehicleTypesAllowed: z.vehicleTypesAllowed, basePricePerHour: z.basePricePerHour,
      openTime: z.openTime, closeTime: z.closeTime, amenities: z.amenities,
      images: (z.images || []).filter(Boolean), // blank URLs are skipped
      isActive: true,
    });
    const slotDocs = [];
    for (const [type, count] of Object.entries(z.slots)) {
      for (let i = 1; i <= count; i++) {
        slotDocs.push({ zone: zone._id, label: `${PREFIX[type]}-${String(i).padStart(2, '0')}`, vehicleType: type, hasEVCharger: type === 'ev' });
      }
    }
    await Slot.insertMany(slotDocs);
    zoneDocs.push({ zone, slots: await Slot.find({ zone: zone._id }).lean() });
  }

  // A few sample bookings: some past (completed), some upcoming (confirmed)
  const now = new Date();
  const todayAt = (dayOffset, hour) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour, 0, 0);
  const samples = [
    { z: 0, u: 0, type: 'car', day: -3, from: 18, hrs: 2, status: 'completed' },
    { z: 1, u: 0, type: 'bike', day: -2, from: 12, hrs: 3, status: 'completed' },
    { z: 2, u: 2, type: 'ev', day: -1, from: 9, hrs: 8, status: 'completed' },
    { z: 3, u: 1, type: 'suv', day: -1, from: 17, hrs: 3, status: 'completed' },
    { z: 0, u: 3, type: 'car', day: 1, from: 19, hrs: 2, status: 'confirmed' },
    { z: 3, u: 1, type: 'suv', day: 2, from: 15, hrs: 4, status: 'confirmed' },
    { z: 2, u: 2, type: 'ev', day: 1, from: 9, hrs: 8, status: 'confirmed' },
    { z: 5, u: 4, type: 'bike', day: 1, from: 20, hrs: 2, status: 'confirmed' },
  ];
  for (const s of samples) {
    const { zone, slots } = zoneDocs[s.z];
    const slot = slots.find((x) => x.vehicleType === s.type);
    const user = userDocs[s.u];
    const start = todayAt(s.day, s.from);
    const end = new Date(+start + s.hrs * HOUR);
    const total = Math.round(zone.basePricePerHour * s.hrs * 1.1);
    const booking = await Booking.create({
      user: user._id, zone: zone._id, slot: slot._id, slotLabel: slot.label,
      vehiclePlate: (user.vehicles.find((v) => v.type === s.type) || user.vehicles[0]).plateNumber, vehicleType: s.type,
      startTime: start, endTime: end, durationHours: s.hrs, pricePerHourApplied: Math.round(total / s.hrs), totalAmount: total,
      status: s.status,
    });
    await Transaction.create({
      booking: booking._id, user: user._id, zone: zone._id, owner: zone.owner, amount: total,
      method: 'upi', status: 'success', referenceId: makeRef('SPC'), paidAt: new Date(Math.min(+now, +start - 3 * HOUR)),
    });
  }

  console.log(`\nSeeded: ${ownerDocs.length} owners, ${userDocs.length} drivers, ${zoneDocs.length} zones, ${zoneDocs.reduce((a, z) => a + z.slots.length, 0)} slots, ${samples.length} bookings.`);
  console.log('\nTest logins');
  console.log('  Owner : owner1@spacer.test / Owner@123   (also owner2, owner3)');
  console.log('  Driver: user1@spacer.test  / User@123    (also user2 to user5)');
  console.log('\nNext: run `npm run simulate` to generate 8 weeks of sample history for the Insights page.');
}

run()
  .catch((e) => { console.error('Seed failed:', e.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
