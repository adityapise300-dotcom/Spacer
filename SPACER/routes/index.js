const express = require('express');
const router = express.Router();

router.use('/', require('./publicRoutes'));
router.use('/user', require('./userRoutes'));
router.use('/owner', require('./ownerRoutes'));

module.exports = router;
