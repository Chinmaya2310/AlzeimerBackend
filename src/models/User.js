const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const userSchema = new mongoose.Schema({
    email: {
        type: String,
        unique: true,
        required: true,
    },
    password: {
        type: String,
        required: true,
    },
    phone: {
        type: Number,
        required: true,
    },
    dist: {
        type: Number,
        default: 0.5, // safe-zone radius in km
    },
    // how alerts reach the caregiver: "sms" (Fast2SMS, paid) or "telegram" (free)
    alertChannel: {
        type: String,
        enum: ["sms", "telegram"],
        default: "sms",
    },
    telegramChatId: String,
    telegramName: String,
    telegramLinkCode: String, // one-time code used while connecting Telegram
    telegramPendingChatId: String, // chat that pressed Start but hasn't shared its number yet
    telegramPhone: String, // phone number Telegram confirmed for the connected chat
    // alert state for the walk in progress (see services/geofence.js)
    zoneState: {
        outsideCount: { type: Number, default: 0 },
        alerted: { type: Boolean, default: false },
    },
    // centre of the safe zone; alerts are measured from here
    homeLocation: {
        latitude: Number,
        longitude: Number,
    },
    name: {
        type: String,
        required: false,
    },
    city: {
        type: String,
        required: false,
    },
});

userSchema.pre("save", function (next) {
    const user = this;
    // console.log("User is ", user);
    if (!user.isModified("password")) {
        return next();
    }
    bcrypt.genSalt(10, (err, salt) => {
        if (err) {
            return next(err);
        }
        bcrypt.hash(user.password, salt, (err, hash) => {
            if (err) {
                return next(err);
            }
            user.password = hash;
            next();
        });
    });
});

// password checking method down
userSchema.methods.comparePassword = function (candidatePassword) {
    const user = this;
    return new Promise((resolve, reject) => {
        bcrypt.compare(candidatePassword, user.password, (err, isMatched) => {
            if (err) {
                return reject(err);
            }
            if (!isMatched) {
                return reject(false);
            }
            resolve(true);
        });
    });
};

userSchema.set("toJSON", {
    transform: (doc, ret) => {
        delete ret.password;
        delete ret.telegramLinkCode;
        delete ret.telegramPendingChatId;
        return ret;
    },
});

mongoose.model("User", userSchema);
