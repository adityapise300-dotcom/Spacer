const bcrypt = require('bcrypt');
const User = require('../models/User');

// Compared against when the email is unknown so response time doesn't reveal which emails exist
const DUMMY_HASH = bcrypt.hashSync('spacer-dummy-password', 10);

async function createAccount(role, data) {
  const passwordHash = await bcrypt.hash(data.password, 12);
  return User.create({
    name: data.name, email: data.email, phone: data.phone, passwordHash, role,
    ...(role === 'owner' ? { businessName: data.businessName } : { vehicles: [] }),
  });
}

async function authenticate(email, password, role) {
  const user = await User.findOne({ email: String(email).toLowerCase(), role }).select('+passwordHash');
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  return ok && user ? user : null;
}

// Fresh session id on login (prevents session fixation). Resolves with the safe URL to go to next.
function startSession(req, user) {
  const returnTo = req.session.returnTo;
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.user = { id: user._id.toString(), name: user.name, role: user.role };
      req.session.save((e) => {
        if (e) return reject(e);
        const safe = returnTo && returnTo.startsWith(`/${user.role}`) && !returnTo.startsWith('//');
        resolve(safe ? returnTo : `/${user.role}/dashboard`);
      });
    });
  });
}

function endSession(req, res) {
  req.session.destroy(() => {
    res.clearCookie('spacer.sid');
    res.redirect('/');
  });
}

module.exports = { createAccount, authenticate, startSession, endSession };
