const { createAccount, authenticate, startSession, endSession } = require('../../utils/authFlow');

exports.registerForm = (req, res) => res.render('owner/register', { pageTitle: 'Owner sign up' });

exports.register = async (req, res) => {
  const user = await createAccount('owner', req.body.owner);
  const next = await startSession(req, user);
  req.flash('success', `Welcome to SPACER, ${user.name}. Add your first parking zone to get started.`);
  res.redirect(next);
};

exports.loginForm = (req, res) => res.render('owner/login', { pageTitle: 'Owner login' });

exports.login = async (req, res) => {
  const { email, password } = req.body.login;
  const user = await authenticate(email, password, 'owner');
  if (!user) {
    req.flash('error', 'Invalid email or password. Drivers should use the driver login.');
    return res.redirect('/owner/login');
  }
  const next = await startSession(req, user);
  req.flash('success', `Welcome back, ${user.name}.`);
  res.redirect(next);
};

exports.logout = (req, res) => endSession(req, res);
