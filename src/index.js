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
const mongoURI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/alzheimer";

mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useUnifiedTopology: true,
});
mongoose.connection.on("connected", () => {
    console.log("Connected");
});
mongoose.connection.on("error", () => {
    console.log("Error");
});

app.use(bodyParser.json());
// Telegram bot replies (webhook route must come before the login-protected routes)
require("./services/telegramBot").startBot(app);
app.use(authRoutes);
app.use(trackRoutes);
app.use(detailRoutes);
app.use(alertRoutes);

app.get("/", requireAuth, (req, res) => {
    res.send(`Your email is ${req.user.email}`);
});

app.listen(3001, () => {
    console.log("Listening on port 3001");
});
