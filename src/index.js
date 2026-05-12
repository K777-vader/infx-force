const express = require('express');
const initDb = require('./db');
const app = express();
app.use(express.json());

let db;

async function startServer() {
  db = await initDb();

  // Middleware for Gumroad license check
  const checkLicense = async (req, res, next) => {
    const key = req.headers['x-license-key'];
    if (!key) return res.status(401).json({ error: 'Missing license key' });

    try {
      // REAL GUMROAD VERIFICATION
      // Replace GUMROAD_PRODUCT_ID with your actual product ID
      const productID = process.env.GUMROAD_PRODUCT_ID || 'YOUR_PRODUCT_ID';
      const response = await fetch(`https://api.gumroad.com/v2/licenses/verify?product_id=${productID}&license_key=${key}`);
      const data = await response.json();

      if (!data.success) {
        return res.status(403).json({ error: 'License invalid or expired' });
      }

      // Ensure user is registered in our local DB
      let user = await db.get('SELECT * FROM users WHERE license_key = ?', [key]);
      if (!user) {
        // Auto-register valid Gumroad keys
        const email = data.email || 'unknown';
        const result = await db.run('INSERT INTO users (email, license_key) VALUES (?, ?)', [email, key]);
        user = { id: result.lastID };
      }

      req.userId = user.id;
      next();
    } catch (error) {
      console.error('Gumroad verify error:', error);
      res.status(500).json({ error: 'Authentication service unavailable' });
    }
  };

  // Auth: Register License
  app.post('/api/activate', async (req, res) => {
    const { email, license_key } = req.body;
    try {
      await db.run('INSERT INTO users (email, license_key) VALUES (?, ?)', [email, license_key]);
      res.status(201).json({ message: 'Activated successfully' });
    } catch (e) {
      res.status(400).json({ error: 'License already used or invalid' });
    }
  });

  // Contacts
  app.get('/api/contacts', checkLicense, async (req, res) => {
    const contacts = await db.all('SELECT * FROM contacts WHERE user_id = ?', [req.userId]);
    res.json(contacts);
  });

  app.post('/api/contacts', checkLicense, async (req, res) => {
    const { first_name, last_name, email, phone, company } = req.body;
    const result = await db.run(
      'INSERT INTO contacts (user_id, first_name, last_name, email, phone, company) VALUES (?, ?, ?, ?, ?, ?)',
      [req.userId, first_name, last_name, email, phone, company]
    );
    res.status(201).json({ id: result.lastID });
  });

  // Deals
  app.get('/api/deals', checkLicense, async (req, res) => {
    const deals = await db.all('SELECT * FROM deals WHERE user_id = ?', [req.userId]);
    res.json(deals);
  });

  app.post('/api/deals', checkLicense, async (req, res) => {
    const { contact_id, title, amount, stage } = req.body;
    const result = await db.run(
      'INSERT INTO deals (user_id, contact_id, title, amount, stage) VALUES (?, ?, ?, ?, ?)',
      [req.userId, contact_id, title, amount, stage]
    );
    res.status(201).json({ id: result.lastID });
  });

  app.listen(3000, () => console.log('Infx Force running on http://localhost:3000'));
}

startServer();
