const router = require('express').Router();
const wrapAsync = require('../utils/wrapAsync');
const validate = require('../middleware/validate');
const { redirectIfLoggedIn, ownerOnly, isZoneOwner } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiters');
const s = require('../validations/schemas');

const auth = require('../controllers/owner/authController');
const dashboard = require('../controllers/owner/dashboardController');
const zones = require('../controllers/owner/zoneController');
const slots = require('../controllers/owner/slotController');
const bookings = require('../controllers/owner/bookingController');
const revenue = require('../controllers/owner/revenueController');
const insights = require('../controllers/owner/insightsController');

router.get('/', (req, res) => res.redirect('/owner/dashboard'));

// ---- Auth ----
router.get('/register', redirectIfLoggedIn, wrapAsync(auth.registerForm));
router.post('/register', redirectIfLoggedIn, authLimiter, validate(s.registerOwnerSchema), wrapAsync(auth.register));
router.get('/login', redirectIfLoggedIn, wrapAsync(auth.loginForm));
router.post('/login', redirectIfLoggedIn, authLimiter, validate(s.loginSchema), wrapAsync(auth.login));
router.post('/logout', ownerOnly, auth.logout);

router.get('/dashboard', ownerOnly, wrapAsync(dashboard.dashboard));

// ---- Zones (static /new before /:id) ----
router.get('/zones', ownerOnly, wrapAsync(zones.index));
router.get('/zones/new', ownerOnly, wrapAsync(zones.newForm));
router.post('/zones', ownerOnly, validate(s.zoneSchema), wrapAsync(zones.create));
router.get('/zones/:id/forecast.json', ownerOnly, isZoneOwner, wrapAsync(insights.forecastJson));
router.get('/zones/:id/edit', ownerOnly, isZoneOwner, wrapAsync(zones.editForm));
router.get('/zones/:id/slots/new', ownerOnly, isZoneOwner, wrapAsync(slots.newForm));
router.post('/zones/:id/slots', ownerOnly, isZoneOwner, validate(s.slotCreateSchema), wrapAsync(slots.create));
router.put('/zones/:zoneId/slots/:slotId', ownerOnly, isZoneOwner, validate(s.slotUpdateSchema), wrapAsync(slots.update));
router.delete('/zones/:zoneId/slots/:slotId', ownerOnly, isZoneOwner, wrapAsync(slots.destroy));
router.get('/zones/:id', ownerOnly, isZoneOwner, wrapAsync(zones.show));
router.put('/zones/:id', ownerOnly, isZoneOwner, validate(s.zoneSchema), wrapAsync(zones.update));
router.delete('/zones/:id', ownerOnly, isZoneOwner, wrapAsync(zones.destroy));

// ---- Bookings, revenue, insights ----
router.get('/bookings', ownerOnly, validate(s.ownerBookingsQuerySchema, 'query'), wrapAsync(bookings.list));
router.put('/bookings/:id/status', ownerOnly, validate(s.ownerBookingStatusSchema), wrapAsync(bookings.updateStatus));
router.get('/revenue', ownerOnly, validate(s.revenueQuerySchema, 'query'), wrapAsync(revenue.show));
router.get('/insights', ownerOnly, validate(s.insightsQuerySchema, 'query'), wrapAsync(insights.show));

module.exports = router;
