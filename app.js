// app.js - Node.js + Express backend
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Initialize SQLite database
const db = new sqlite3.Database('./database.sqlite');

// Create tables
db.serialize(() => {
  // Create keys table
  db.run(`CREATE TABLE IF NOT EXISTS keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE,
    createdAt TEXT
  )`);

  // Create subscriptions table
  db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    plan TEXT,
    createdAt TEXT,
    expiresAt TEXT,
    status TEXT DEFAULT 'active'
  )`);

  // Insert some initial data for testing
  const initialKey = crypto.randomBytes(8).toString('hex');
  db.run(`INSERT OR IGNORE INTO keys (key, createdAt) VALUES (?, ?)`, 
    [initialKey, new Date().toISOString()]);
  
  console.log(`Initial test key created: ${initialKey}`);
  
  // Add a test subscription
  const today = new Date();
  const expiryDate = new Date();
  expiryDate.setDate(today.getDate() + 30); // 30-day plan
  
  db.run(`INSERT OR IGNORE INTO subscriptions (userId, plan, createdAt, expiresAt, status) VALUES (?, ?, ?, ?, ?)`,
    [1, '30d', today.toISOString(), expiryDate.toISOString(), 'active']);
});

// API Endpoints

// Generate new key (Admin)
app.post('/admin/generate-key', (req, res) => {
  const newKey = crypto.randomBytes(8).toString('hex');
  const createdAt = new Date().toISOString();
  
  db.run('INSERT INTO keys (key, createdAt) VALUES (?, ?)', [newKey, createdAt], function(err) {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error generating key', error: err.message });
    }
    
    res.status(201).json({ 
      success: true, 
      key: newKey,
      createdAt: createdAt
    });
  });
});

// Get all keys (Admin)
app.get('/admin/keys', (req, res) => {
  db.all('SELECT * FROM keys ORDER BY createdAt DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error fetching keys', error: err.message });
    }
    
    res.status(200).json({ 
      success: true, 
      keys: rows
    });
  });
});

// Verify key
app.post('/verify-key', (req, res) => {
  const { key } = req.body;
  
  if (!key) {
    return res.status(400).json({ success: false, message: 'Key is required' });
  }
  
  db.get('SELECT * FROM keys WHERE key = ?', [key], (err, keyRow) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error verifying key', error: err.message });
    }
    
    if (!keyRow) {
      return res.status(404).json({ success: false, message: 'Invalid key' });
    }
    
    // Get subscription info (for simplicity, we're assuming the first subscription)
    db.get('SELECT * FROM subscriptions WHERE status = "active" LIMIT 1', [], (err, subRow) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Error fetching subscription', error: err.message });
      }
      
      // Calculate remaining days
      const today = new Date();
      const expiryDate = new Date(subRow.expiresAt);
      const remainingDays = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
      
      res.status(200).json({ 
        success: true, 
        message: 'Key is valid',
        subscription: {
          plan: subRow.plan,
          expiresAt: subRow.expiresAt,
          remainingDays: remainingDays
        }
      });
    });
  });
});

// Generate signal (Mine table)
app.post('/generate-signal', (req, res) => {
  const { key } = req.body;
  
  if (!key) {
    return res.status(400).json({ success: false, message: 'Key is required' });
  }
  
  db.get('SELECT * FROM keys WHERE key = ?', [key], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error verifying key', error: err.message });
    }
    
    if (!row) {
      return res.status(404).json({ success: false, message: 'Invalid key' });
    }
    
    // Generate a 5x5 grid with percentages
    const grid = [];
    for (let i = 0; i < 5; i++) {
      const row = [];
      for (let j = 0; j < 5; j++) {
        // Generate random percentage between 0 and 100
        const percentage = Math.floor(Math.random() * 101);
        let color;
        
        // Determine color based on percentage
        if (percentage >= 70) {
          color = 'green';
        } else if (percentage >= 40) {
          color = 'orange';
        } else {
          color = 'red';
        }
        
        row.push({
          percentage,
          color
        });
      }
      grid.push(row);
    }
    
    res.status(200).json({ 
      success: true, 
      grid
    });
  });
});

// Serve HTML files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
