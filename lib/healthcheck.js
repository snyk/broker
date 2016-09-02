const express = require('express');
const router = express.Router();

module.exports = router;

router.route('/').get(function (req, res, next) {
  // Only check currently is that the webserver is up
  res.status(200).json({ ok: true });
});
