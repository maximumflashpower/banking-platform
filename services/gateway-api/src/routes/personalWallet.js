const express = require('express');
const router = express.Router();

// Temporary stub to keep gateway stable
router.get('/health/personal-wallet', (req, res) => {
  res.json({ ok: true });
});

module.exports = router;
