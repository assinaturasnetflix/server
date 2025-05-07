const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Helper functions
const readKeysFile = () => {
  try {
    const data = fs.readFileSync(path.join(__dirname, 'keys.json'), 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading keys file:', error);
    return [];
  }
};

const writeKeysFile = (keys) => {
  try {
    fs.writeFileSync(path.join(__dirname, 'keys.json'), JSON.stringify(keys, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing keys file:', error);
    return false;
  }
};

const calculateTimeRemaining = (createdAt, planDays) => {
  const createdDate = new Date(createdAt);
  const expiryDate = new Date(createdDate);
  expiryDate.setDate(expiryDate.getDate() + parseInt(planDays));
  
  const timeRemaining = expiryDate - new Date();
  return Math.max(0, Math.floor(timeRemaining / 1000)); // Return seconds remaining
};

// Initialize keys.json if it doesn't exist
if (!fs.existsSync(path.join(__dirname, 'keys.json'))) {
  writeKeysFile([]);
  console.log('Created empty keys.json file');
}

// Authentication Endpoint
app.post('/auth', (req, res) => {
  const { key } = req.body;
  
  if (!key) {
    return res.status(400).json({ error: 'Key is required' });
  }
  
  const keys = readKeysFile();
  const keyData = keys.find(k => k.key === key);
  
  if (!keyData) {
    return res.status(404).json({ status: 'invalid', message: 'Key not found' });
  }
  
  if (keyData.status === 'blocked') {
    return res.status(403).json({ status: 'blocked', message: 'This key has been blocked' });
  }
  
  const planDays = parseInt(keyData.plan.replace('d', ''));
  const timeRemaining = calculateTimeRemaining(keyData.createdAt, planDays);
  
  if (timeRemaining <= 0) {
    return res.status(403).json({ status: 'expired', message: 'Key has expired' });
  }
  
  res.json({
    status: 'valid',
    plan: keyData.plan,
    timeRemaining: timeRemaining,
    createdAt: keyData.createdAt
  });
});

// Generate Mine Signal
app.post('/generate', (req, res) => {
  // Simplified signal generation logic
  const board = [];
  
  // Generate a 5x5 board with probabilities
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const risk = Math.random();
      board.push({
        position: i * 5 + j,
        risk: risk,
        safe: risk < 0.7 // 70% chance of being safe
      });
    }
  }
  
  // Sort by risk (lowest risk first)
  board.sort((a, b) => a.risk - b.risk);
  
  // Select a safe spot (lowest risk)
  const safestSpot = board[0].position;
  
  res.json({
    board: board,
    recommendation: safestSpot
  });
});

// Admin Routes
const ADMIN_PASSWORD = 'admin123'; // Fixed password for admin access

// Admin Authentication Middleware
const authenticateAdmin = (req, res, next) => {
  const { password } = req.body;
  
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
};

// Admin Login
app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Get All Keys
app.post('/admin/keys', authenticateAdmin, (req, res) => {
  const keys = readKeysFile();
  res.json(keys);
});

// Create New Key
app.post('/admin/keys/create', authenticateAdmin, (req, res) => {
  const { plan } = req.body;
  
  if (!plan || !['7d', '15d', '30d'].includes(plan)) {
    return res.status(400).json({ error: 'Valid plan (7d, 15d, or 30d) is required' });
  }
  
  const keys = readKeysFile();
  
  // Generate a random key
  const newKey = Math.random().toString(36).substring(2, 10);
  
  keys.push({
    key: newKey,
    plan: plan,
    createdAt: new Date().toISOString(),
    status: 'active'
  });
  
  if (writeKeysFile(keys)) {
    res.json({ success: true, key: newKey });
  } else {
    res.status(500).json({ error: 'Failed to save key' });
  }
});

// Block Key
app.post('/admin/keys/block', authenticateAdmin, (req, res) => {
  const { key } = req.body;
  
  if (!key) {
    return res.status(400).json({ error: 'Key is required' });
  }
  
  const keys = readKeysFile();
  const keyIndex = keys.findIndex(k => k.key === key);
  
  if (keyIndex === -1) {
    return res.status(404).json({ error: 'Key not found' });
  }
  
  keys[keyIndex].status = 'blocked';
  
  if (writeKeysFile(keys)) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'Failed to update key' });
  }
});

// Delete Key
app.post('/admin/keys/delete', authenticateAdmin, (req, res) => {
  const { key } = req.body;
  
  if (!key) {
    return res.status(400).json({ error: 'Key is required' });
  }
  
  let keys = readKeysFile();
  const initialLength = keys.length;
  
  keys = keys.filter(k => k.key !== key);
  
  if (keys.length === initialLength) {
    return res.status(404).json({ error: 'Key not found' });
  }
  
  if (writeKeysFile(keys)) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'Failed to delete key' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
