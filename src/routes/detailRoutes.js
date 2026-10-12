const express = require("express");
const mongoose = require("mongoose");
const requireAuth = require("../middlewares/requireAuth");
const User = mongoose.model("User");
const router = express.Router();
router.use(requireAuth);

router.get("/operationUser", async (req, res) => {
    res.send(req.user);
});

router.put("/operationUser", async (req, res) => {
    const { phone, name, city, dist } = req.body.userData || {};
    try {
        const user = await User.findByIdAndUpdate(
            req.user._id,
            { phone, name, city, dist },
            { new: true, runValidators: true, omitUndefined: true }
        );
        res.send(user);
    } catch (err) {
        res.status(422).send({ error: err.message });
    }
});
module.exports = router;
