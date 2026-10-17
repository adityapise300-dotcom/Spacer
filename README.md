# SPACER: Smarter Parking, Happier Cities

SPACER (Vehicle Accommodation Zone) is a smart parking marketplace. Drivers find and book parking; owners list unused space and earn revenue. Built with Node.js, Express, MongoDB (Mongoose) and EJS.

## Setup

1. Install Node.js (LTS) and have MongoDB running locally, or use a MongoDB Atlas URI.
2. In the project folder run:

```bash
npm init -y
npm pkg set main=app.js scripts.start="node app.js" scripts.dev="nodemon app.js" scripts.seed="node seeds/index.js" scripts.simulate="node seeds/simulate.js"
npm install express@4 mongoose razorpay ejs ejs-mate express-session connect-mongo@5 bcrypt joi connect-flash method-override helmet express-rate-limit express-mongo-sanitize morgan dotenv
npm install --save-dev nodemon
cp .env.example .env        # Windows: copy .env.example .env
```

3. Edit `.env` (set `MONGO_URI` and a long random `SESSION_SECRET`).
4. Load sample data, generate sample history, start the app:

```bash
npm run seed
npm run simulate
npm run dev
```

Open http://localhost:3000

## Test logins

| Role | Email | Password |
|---|---|---|
| Owner | owner1@spacer.test (also owner2, owner3) | Owner@123 |
| Driver | user1@spacer.test (also user2 to user5) | User@123 |

## Image links

Zone photos are stored as URL strings in `ParkingZone.images`. In `seeds/data.js` they are blank (`images: ['']`); paste links there and re-run `npm run seed`, or add links from the zone form (one per line). Zones without images show a placeholder.

## Folder structure

`app.js` (entry) · `config/` · `models/` · `controllers/{user,owner}` · `routes/` · `middleware/` · `validations/` · `services/` (availability, pricing, forecast, payment) · `views/` · `public/` · `seeds/`

## Key behaviour

- **No double booking:** a slot is busy when a confirmed/checked-in booking, or an unexpired 10-minute payment hold, overlaps the window (`existing.start < newEnd AND existing.end > newStart`). After inserting, the booking re-checks for a rival; the smaller `_id` wins and the other is removed.
- **Cancellation:** free more than 2 hours before start; otherwise 50% refund.
- **Roles:** drivers get a 403 on `/owner/*` and owners on `/user/*`.
- **Payments:** Razorpay Checkout in Test Mode (order, popup, HMAC signature check, server-side fetch, refunds). Add your `rzp_test_` keys to `.env`. Test UPI: `success@razorpay` / `failure@razorpay`.
- **Timezone:** the app runs in `Asia/Kolkata`.

## Smart pricing and demand forecast

`price/hour = base × demand × time-of-day × occupancy`, each factor clamped and the total kept between 0.8× and 2.0× of base. The booking page shows the breakdown ("Why this price?"), and it is stored on the booking.

The forecast is a weighted moving average of the same weekday-hour over the previous 8 weeks (weights decay by 0.8 per week). It is compared with a naive baseline (same hour yesterday) using MAE and MAPE, shown on `/owner/insights` together with suggested price changes.

`npm run simulate` generates 8 weeks of synthetic bookings per zone (seeded, reproducible), holds out the final week, prints forecast error against the baseline, and prints a search-and-park time comparison. Assumptions: without SPACER a driver circles 8 to 15 minutes; with SPACER the driver walks to a held bay in 1 to 3 minutes, and 5% of trips fall back to circling. Use `--no-save` to skip storing the data, or `--seed=N` to change the random seed.

**All simulation data is synthetic. Results are indicative, not field-measured.**

## Manual test checklist

- [ ] Owner registers, creates a zone, adds slots, sees bookings and revenue.
- [ ] Driver registers, searches, sees live availability, books, pays, views receipt, cancels.
- [ ] Two drivers cannot book the same slot for overlapping times.
- [ ] A driver opening `/owner/dashboard` (or an owner opening `/user/dashboard`) gets a 403 page.
- [ ] Bad ids, duplicate emails and unknown URLs show friendly pages. Run with `NODE_ENV=production` to confirm no stack traces.
- [ ] Booking page shows the price breakdown; Insights shows the chart, error vs baseline and suggestions.
- [ ] `npm run simulate` prints both tables.

## Notes

Forms rely on `SameSite=Lax` session cookies; add CSRF tokens before any real deployment. Deleting a zone also deletes its slots, bookings and transactions.

## Google Maps directions

Drivers get a **Get directions** button on the zone page, search result cards, booking details, the bookings list and the dashboard. It opens Google Maps (app on phones, website on desktop) with turn-by-turn directions from the driver's current location to the zone.

- **No API key, billing or extra setup.** It uses plain Google Maps URLs built from the zone's saved coordinates (`utils/helpers.js` → `mapsDirectionsUrl`, rendered by `views/includes/directionsButton.ejs`).
- Directions go to the **zone entrance**. Maps cannot route to a single bay, so the booking page also shows the slot label.
- The button is hidden for zones without coordinates, and for bookings that are cancelled, expired, completed or no-show.
- Owners must enter correct coordinates in the zone form (`longitude, latitude`), because the directions are only as accurate as that pin.
