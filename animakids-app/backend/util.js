const crypto = require("crypto");
function uuid() { return crypto.randomUUID(); }
function nowIso() { return new Date().toISOString(); }
module.exports = { uuid, nowIso };
