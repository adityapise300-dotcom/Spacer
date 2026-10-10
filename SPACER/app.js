// Run the whole process in Indian Standard Time so datetime-local inputs,
// peak-hour pricing and "today" all mean Pune time, wherever the server is hosted.
process.env.TZ = 'Asia/Kolkata';
require('dotenv').config();

const path = require('path');
const express = require('express');
const ejsMate = require('ejs-mate');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const methodOverride = require('method-override');
const flash = require('connect-flash');

const connectDB = require('./config/db');
const sessionMiddleware = require('./config/session');
const locals = require('./middleware/locals');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes');
const { expireStaleHolds } = require('./services/availabilityService');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

if (isProd) app.set('trust proxy', 1);

app.engine('ejs', ejsMate);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---- Middleware order matters (see build prompt, Section 7) ----
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'script-src': ["'self'", 'https://cdn.jsdelivr.net'],
        'style-src': ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'data:', 'https://cdn.jsdelivr.net', 'https://fonts.gstatic.com'],
        // Zone photos are owner-supplied URLs from any https host
        'img-src': ["'self'", 'data:', 'https:'],
        'connect-src': ["'self'"],
        // Lets the app work over plain http on localhost
        'upgrade-insecure-requests': null,
      },
    },
  })
);
app.use(morgan(isProd ? 'combined' : 'dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(mongoSanitize());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(sessionMiddleware);
app.use(flash());
app.use(locals);

app.use('/', routes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  connectDB()
    .then(() => {
      // Safety net: mark unpaid holds as expired even if nobody reads them.
      setInterval(() => {
        expireStaleHolds().catch((e) => console.error('Hold expiry job failed:', e.message));
      }, 60 * 1000).unref();

      app.listen(PORT, () => console.log(`SPACER running on http://localhost:${PORT} (${process.env.NODE_ENV || 'development'})`));
    })
    .catch((err) => {
      console.error('Could not start SPACER:', err.message);
      process.exit(1);
    });
}

module.exports = app;
