// Local runs read settings from .env; a host (e.g. Render) provides them as environment variables
try {
    process.loadEnvFile();
} catch (err) {
    // no .env file: settings come from the environment
}
for (const name of ["JWT_SECRET", "MONGO_URI"]) {
    if (!process.env[name]) {
        console.error(`Missing required setting ${name}`);
        process.exit(1);
    }
}

require("./models/User");
require("./models/Track");
require("./models/Alert");
const express = require("express");
const mongoose = require("mongoose");
const requireAuth = require("./middlewares/requireAuth");
const bodyParser = require("body-parser");
const app = express();
const authRoutes = require("./routes/authRoutes");
const trackRoutes = require("./routes/trackRoutes");
const detailRoutes = require("./routes/detailRoutes");
const alertRoutes = require("./routes/alertRoutes");
const mongoURI = process.env.MONGO_URI;

mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useUnifiedTopology: true,
});
mongoose.connection.on("connected", () => {
    console.log("Connected");
});
mongoose.connection.on("error", err => {
    console.log("Database error:", err.message);
});

app.use(bodyParser.json());
// for the host's health checks and waking a sleeping free instance
app.get("/health", (req, res) => res.send({ ok: true }));
// Telegram bot replies (webhook route must come before the login-protected routes)
require("./services/telegramBot").startBot(app);
app.use(authRoutes);
app.use(trackRoutes);
app.use(detailRoutes);
app.use(alertRoutes);

app.get("/", requireAuth, (req, res) => {
    res.send(`Your email is ${req.user.email}`);
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});
