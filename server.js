const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ac-mines-hack-secret-key-2025';

// Middleware
app.use(cors());
app.use(bodyParser.json());

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

const calculateTimeRemaining = (key) => {
  const createdAt = new Date(key.createdAt);
  let daysToAdd = 0;
  
  if (key.plan === '7d') daysToAdd = 7;
  else if (key.plan === '15d') daysToAdd = 15;
  else if (key.plan === '30d') daysToAdd = 30;
  
  const expirationDate = new Date(createdAt);
  expirationDate.setDate(expirationDate.getDate() + daysToAdd);
  
  const now = new Date();
  const timeRemaining = expirationDate - now;
  
  return Math.max(0, Math.floor(timeRemaining / 1000)); // Return seconds remaining
};

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Initialize keys.json if it doesn't exist
if (!fs.existsSync(path.join(__dirname, 'keys.json'))) {
  writeKeysFile([
    {
      key: "demo123",
      plan: "7d",
      createdAt: new Date().toISOString(),
      status: "active"
    }
  ]);
}

// Routes
app.post('/auth', (req, res) => {
  const { key } = req.body;
  
  if (!key) {
    return res.status(400).json({ message: 'Key is required' });
  }
  
  const keys = readKeysFile();
  const foundKey = keys.find(k => k.key === key);
  
  if (!foundKey) {
    return res.status(404).json({ message: 'Invalid key', status: 'invalid' });
  }
  
  if (foundKey.status !== 'active') {
    return res.status(403).json({ message: 'Key is blocked', status: 'blocked' });
  }
  
  const timeRemaining = calculateTimeRemaining(foundKey);
  
  if (timeRemaining <= 0) {
    foundKey.status = 'expired';
    writeKeysFile(keys);
    return res.status(403).json({ message: 'Key has expired', status: 'expired' });
  }
  
  // Generate JWT token
  const token = jwt.sign(
    { key: foundKey.key, plan: foundKey.plan },
    JWT_SECRET,
    { expiresIn: timeRemaining + 's' }
  );
  
  res.json({
    status: 'valid',
    plan: foundKey.plan,
    timeRemaining,
    token
  });
});

app.post('/generate', verifyToken, (req, res) => {
  // Simulate mines game probabilities
  const board = [];
  const rows = 5;
  const cols = 5;
  
  // Random safe position
  const safeRow = Math.floor(Math.random() * rows);
  const safeCol = Math.floor(Math.random() * cols);
  
  for (let i = 0; i < rows; i++) {
    const row = [];
    for (let j = 0; j < cols; j++) {
      // Each cell has either high or low probability of being safe
      let probability;
      
      if (i === safeRow && j === safeCol) {
        // Safe cell with high probability
        probability = Math.floor(80 + Math.random() * 20); // 80-99%
      } else {
        // Other cells with varying probabilities
        probability = Math.floor(5 + Math.random() * 70); // 5-75%
      }
      
      row.push(probability);
    }
    board.push(row);
  }
  
  res.json({
    board,
    safePosition: { row: safeRow, col: safeCol }
  });
});

// Admin authentication (simple password for demo)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: 'Invalid admin password' });
  }
  
  const adminToken = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token: adminToken });
});

const verifyAdminToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Admin authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid admin token' });
  }
};

app.get('/admin/keys', verifyAdminToken, (req, res) => {
  const keys = readKeysFile();
  res.json({ keys });
});

app.post('/admin/keys/create', verifyAdminToken, (req, res) => {
  const { plan } = req.body;
  
  if (!plan || !['7d', '15d', '30d'].includes(plan)) {
    return res.status(400).json({ message: 'Valid plan (7d, 15d, or 30d) is required' });
  }
  
  const keys = readKeysFile();
  
  // Generate random key
  const generateKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };
  
  let newKey = generateKey();
  
  // Make sure key is unique
  while (keys.some(k => k.key === newKey)) {
    newKey = generateKey();
  }
  
  const keyData = {
    key: newKey,
    plan,
    createdAt: new Date().toISOString(),
    status: 'active'
  };
  
  keys.push(keyData);
  writeKeysFile(keys);
  
  res.json({ message: 'Key created successfully', key: keyData });
});

app.post('/admin/keys/update', verifyAdminToken, (req, res) => {
  const { key, status } = req.body;
  
  if (!key || !status || !['active', 'blocked'].includes(status)) {
    return res.status(400).json({ message: 'Valid key and status (active or blocked) are required' });
  }
  
  const keys = readKeysFile();
  const keyIndex = keys.findIndex(k => k.key === key);
  
  if (keyIndex === -1) {
    return res.status(404).json({ message: 'Key not found' });
  }
  
  keys[keyIndex].status = status;
  writeKeysFile(keys);
  
  res.json({ message: 'Key updated successfully', key: keys[keyIndex] });
});

app.post('/admin/keys/delete', verifyAdminToken, (req, res) => {
  const { key } = req.body;
  
  if (!key) {
    return res.status(400).json({ message: 'Key is required' });
  }
  
  const keys = readKeysFile();
  const filteredKeys = keys.filter(k => k.key !== key);
  
  if (filteredKeys.length === keys.length) {
    return res.status(404).json({ message: 'Key not found' });
  }
  
  writeKeysFile(filteredKeys);
  
  res.json({ message: 'Key deleted successfully' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
