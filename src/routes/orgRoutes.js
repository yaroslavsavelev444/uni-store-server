const express = require("express");
const router = express.Router();
const orgController = require("../controllers/orgController");

router.get("/getOrg", orgController.getOrg);

module.exports = router;
