const { createAccount, authenticate, startSession, endSession } = require('../../utils/authFlow');

exports.registerForm = (req, res) => res.render('user/register', { pageTitle: 'Driver sign up' });

exports.register = async (req, res) => {
  const user = await createAccount('user', req.body.user);
  const next = await startSession(req, user);
  req.flash('success', `Welcome to SPACER, ${user.name}!`);
  res.redirect(next);
};

exports.loginForm = (req, res) => res.render('user/login', { pageTitle: 'Driver login' });

exports.login = async (req, res) => {
  const { email, password } = req.body.login;
  const user = await authenticate(email, password, 'user');
  if (!user) {
    req.flash('error', 'Invalid email or password. Owners should use the owner login.');
    return res.redirect('/user/login');
  }
  const next = await startSession(req, user);
  req.flash('success', `Welcome back, ${user.name}.`);
  res.redirect(next);
};

exports.logout = (req, res) => endSession(req, res);
