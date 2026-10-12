const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = mongoose.model("User");
module.exports = (req, res, next) => {
    const { authorization } = req.headers;
    // authorization = "Bearer dskvjnsdlvsndsvlnsd;vfn;bsdn"
    if (!authorization) {
        return res.status(401).send({ error: "You must be logged in" });
    }
    const token = authorization.replace("Bearer ", "");
    jwt.verify(token, process.env.JWT_SECRET, async (err, payload) => {
        if (err) {
            return res.status(401).send({ error: "You must be logged in" });
        }
        console.log(payload);
        const { userId } = payload;
        const user = await User.findById(userId);
        req.user = user;
        next();
    });
};
