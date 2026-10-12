# Alzheimer's Patient Tracker (backend)

Node.js / Express / MongoDB API for the [AlzeimerPatientTracker](https://github.com/Chinmaya2310/AlzeimerPatientTracker) app: auth, saved GPS tracks, caregiver profile and safe zone, and alerts by Telegram (free) or SMS via Fast2SMS (paid).

## Setup
```bash
docker run -d --name alz-mongo -p 27017:27017 mongo:4.4
cp .env.example .env      # set JWT_SECRET, FAST2SMS_API_KEY and (optional) TELEGRAM_BOT_TOKEN from @BotFather
npm install
npm start                 # http://localhost:3001
```

## API
| Method | Path | Purpose |
|---|---|---|
| POST | `/signup`, `/signin` | Create account / log in, returns a JWT |
| GET, POST | `/tracks` | List / save the user's recorded tracks |
| GET, PUT | `/operationUser` | Read / update the logged-in user's profile (name, phone, city, safe zone: `homeLocation` and radius `dist` in km, validated to 0.1–10 km) |
| POST | `/sendMessage` | Send the "outside safe area" alert (Telegram message + map pin, or SMS with a Google Maps link) and record it |
| POST | `/telegram/link`, `/telegram/verify` | Connect Telegram: get a one-time `t.me/<bot>?start=<code>` link, then confirm after the caregiver taps Start |
| PUT | `/alert-channel` | Choose `sms` or `telegram` |
| DELETE | `/telegram` | Disconnect Telegram (back to SMS) |
| POST | `/alerts/test` | Send a test alert on the chosen channel |
| GET | `/alerts` | The user's 50 most recent alerts (time, location, distance, whether the SMS was sent) |

## 2026 fixes
- New users get a default safe distance of 0.5 km; every alert is stored for the app's alert history
- Secrets (database URL, JWT key, SMS key) moved out of the code into `.env`
- Password hashes no longer returned by `/signin` and `/operationUser`
- `PUT /operationUser` only updates the logged-in user (previously any user ID in the request body)
- `/sendMessage` always responds and no longer crashes the server when the SMS provider fails; message fits in one SMS
