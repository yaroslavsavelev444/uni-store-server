const express = require("express");
const router = express.Router();
const constructorController = require("../controllers/constructorController");

router.post("/submit", constructorController.submitData);

module.exports = router;