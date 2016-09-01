const express = require('express');
const router = express.Router();

module.exports = router;

// Performs lightweight checks that are both cheap and deep.
// Return 500 in case of a problem, which will alert the healthchecker that
// this server cannot perform mandatory operations
router.route('/').get(function (req, res, next) {
  // TODO add checks
  res.status(200).json({ ok: true });
});
