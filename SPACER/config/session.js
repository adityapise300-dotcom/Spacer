const session = require('express-session');
const MongoStore = require('connect-mongo');

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is missing. Copy .env.example to .env and set it.');
}
if (!process.env.MONGO_URI) {
  throw new Error('MONGO_URI is missing. Copy .env.example to .env and set it.');
}

// Sessions live in MongoDB so they survive server restarts.
module.exports = session({
  name: 'spacer.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions',
    ttl: 7 * 24 * 60 * 60,
    touchAfter: 24 * 60 * 60,
  }),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
});
