const router = require('express').Router();
const wrapAsync = require('../utils/wrapAsync');
const c = require('../controllers/publicController');

router.get('/', wrapAsync(c.home));
router.get('/about', wrapAsync(c.about));

module.exports = router;
