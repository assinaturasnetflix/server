const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

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
    fs.writeFileSync(
      path.join(__dirname, 'keys.json'),
      JSON.stringify(keys, null, 2),
      'utf8'
    );
    return true;
  } catch (error) {
    console.error('Error writing keys file:', error);
    return false;
  }
};

// Initialize keys.json if it doesn't exist
if (!fs.existsSync(path.join(__dirname, 'keys.json'))) {
  writeKeysFile([]);
}

// Calculate time remaining in seconds
const calculateTimeRemaining = (keyData) => {
  if (keyData.status !== 'active') return 0;
  
  const createdAt = new Date(keyData.createdAt);
  const now = new Date();
  
  let daysToAdd = 0;
  if (keyData.plan === '7d') daysToAdd = 7;
  else if (keyData.plan === '15d') daysToAdd = 15;
  else if (keyData.plan === '30d') daysToAdd = 30;
  
  const expiryDate = new Date(createdAt);
  expiryDate.setDate(expiryDate.getDate() + daysToAdd);
  
  const timeRemaining = expiryDate - now;
  return timeRemaining > 0 ? Math.floor(timeRemaining / 1000) : 0;
};

// Authentication endpoint
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

  const timeRemaining = calculateTimeRemaining(keyData);

  // Check if the key has expired
  if (timeRemaining <= 0 && keyData.status === 'active') {
    keyData.status = 'expired';
    writeKeysFile(keys);
    return res.json({ status: 'expired', message: 'Key has expired' });
  }

  if (keyData.status === 'blocked') {
    return res.json({ status: 'blocked', message: 'Key has been blocked' });
  }

  return res.json({
    status: 'valid',
    plan: keyData.plan,
    timeRemaining: timeRemaining,
    message: 'Authentication successful'
  });
});

// Generate signal endpoint
app.post('/generate', (req, res) => {
  const { key } = req.body;
  if (!key) {
    return res.status(400).json({ error: 'Key is required' });
  }

  const keys = readKeysFile();
  const keyData = keys.find(k => k.key === key);

  if (!keyData || keyData.status !== 'active' || calculateTimeRemaining(keyData) <= 0) {
    return res.status(403).json({ error: 'Invalid or expired key' });
  }

  // Generate the 5x5 grid with probabilities
  const grid = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const probability = Math.floor(Math.random() * 101); // 0-100
      grid.push({
        position: i * 5 + j + 1,
        probability: probability,
        safe: probability > 65 // Consider safe if probability > 65%
      });
    }
  }

  // Sort by probability to find safest positions
  const sortedPositions = [...grid].sort((a, b) => b.probability - a.probability);
  const recommendedPosition = sortedPositions[0].position;

  return res.json({
    recommendedPosition: recommendedPosition,
    grid: grid
  });
});

// Admin routes
const ADMIN_PASSWORD = "admin123"; // Fixed admin password

// Admin authentication middleware
const authenticateAdmin = (req, res, next) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Admin login
app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    return res.json({ success: true });
  }
  return res.status(401).json({ error: 'Unauthorized' });
});

// List all keys
app.post('/admin/keys', authenticateAdmin, (req, res) => {
  const keys = readKeysFile();
  res.json({ keys });
});

// Create new key
app.post('/admin/keys/create', authenticateAdmin, (req, res) => {
  const { plan } = req.body;
  if (!plan || !['7d', '15d', '30d'].includes(plan)) {
    return res.status(400).json({ error: 'Valid plan required (7d, 15d, or 30d)' });
  }

  const keys = readKeysFile();
  
  // Generate a unique key
  const generateKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };
  
  let newKey;
  do {
    newKey = generateKey();
  } while (keys.some(k => k.key === newKey));
  
  const keyData = {
    key: newKey,
    plan: plan,
    createdAt: new Date().toISOString(),
    status: 'active'
  };
  
  keys.push(keyData);
  
  if (writeKeysFile(keys)) {
    res.json({ success: true, key: keyData });
  } else {
    res.status(500).json({ error: 'Failed to save key' });
  }
});

// Block key
app.post('/admin/keys/block', authenticateAdmin, (req, res) => {
  const { key } = req.body;
  if (!key) {
    return res.status(400).json({ error: 'Key is required' });
  }

  const keys = readKeysFile();
  const keyData = keys.find(k => k.key === key);

  if (!keyData) {
    return res.status(404).json({ error: 'Key not found' });
  }

  keyData.status = 'blocked';
  
  if (writeKeysFile(keys)) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'Failed to update key' });
  }
});

// Delete key
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

// Serve the admin panel
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve the main application
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
