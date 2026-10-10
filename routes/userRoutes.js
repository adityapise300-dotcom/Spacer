const router = require('express').Router();
const wrapAsync = require('../utils/wrapAsync');
const validate = require('../middleware/validate');
const { redirectIfLoggedIn, driverOnly, isBookingOwner } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiters');
const s = require('../validations/schemas');

const auth = require('../controllers/user/authController');
const dashboard = require('../controllers/user/dashboardController');
const zones = require('../controllers/user/zoneController');
const bookings = require('../controllers/user/bookingController');
const payments = require('../controllers/user/paymentController');
const profile = require('../controllers/user/profileController');

router.get('/', (req, res) => res.redirect('/user/dashboard'));

// ---- Auth ----
router.get('/register', redirectIfLoggedIn, wrapAsync(auth.registerForm));
router.post('/register', redirectIfLoggedIn, authLimiter, validate(s.registerUserSchema), wrapAsync(auth.register));
router.get('/login', redirectIfLoggedIn, wrapAsync(auth.loginForm));
router.post('/login', redirectIfLoggedIn, authLimiter, validate(s.loginSchema), wrapAsync(auth.login));
router.post('/logout', driverOnly, auth.logout);

// ---- Driver pages (static paths before /:id paths) ----
router.get('/dashboard', driverOnly, wrapAsync(dashboard.dashboard));
router.get('/search', driverOnly, validate(s.searchQuerySchema, 'query'), wrapAsync(zones.search));
router.get('/zones/:id', driverOnly, validate(s.zoneDetailsQuerySchema, 'query'), wrapAsync(zones.show));
router.post('/zones/:id/book', driverOnly, validate(s.bookingSchema), wrapAsync(bookings.create));

router.get('/bookings', driverOnly, wrapAsync(bookings.list));
router.get('/bookings/:id', driverOnly, isBookingOwner, wrapAsync(bookings.show));
router.get('/bookings/:id/pay', driverOnly, isBookingOwner, wrapAsync(payments.payPage));
router.post('/bookings/:id/pay', driverOnly, isBookingOwner, validate(s.paymentSchema), wrapAsync(payments.pay));
router.get('/bookings/:id/receipt', driverOnly, isBookingOwner, wrapAsync(bookings.receipt));
router.put('/bookings/:id/cancel', driverOnly, isBookingOwner, wrapAsync(bookings.cancel));

router.get('/profile', driverOnly, wrapAsync(profile.show));
router.put('/profile', driverOnly, profile.cleanVehicles, validate(s.profileSchema), wrapAsync(profile.update));

module.exports = router;
