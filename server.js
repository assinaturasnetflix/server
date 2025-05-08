const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const bcrypt = require('bcrypt');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection
let db;

async function initializeDatabase() {
  db = await open({
    filename: './database.sqlite',
    driver: sqlite3.Database
  });

  // Create tables if they don't exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT UNIQUE,
      pin TEXT
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      plan TEXT,
      createdAt TEXT,
      expiresAt TEXT,
      status TEXT DEFAULT 'active',
      FOREIGN KEY(userId) REFERENCES users(id)
    );
  `);

  // Create admin user if it doesn't exist
  const admin = await db.get('SELECT * FROM users WHERE numero = ?', ['admin']);
  if (!admin) {
    const hashedPin = await bcrypt.hash('0000', 10);
    await db.run('INSERT INTO users (numero, pin) VALUES (?, ?)', ['admin', hashedPin]);
    
    const adminUser = await db.get('SELECT id FROM users WHERE numero = ?', ['admin']);
    
    // Create permanent subscription for admin
    await db.run(
      'INSERT INTO subscriptions (userId, plan, createdAt, expiresAt, status) VALUES (?, ?, ?, ?, ?)',
      [adminUser.id, 'admin', new Date().toISOString(), '9999-12-31T23:59:59Z', 'active']
    );
    
    console.log('Admin user created successfully');
  }
}

// Initialize database
initializeDatabase().then(() => {
  console.log('Database initialized');
}).catch(err => {
  console.error('Database initialization failed:', err);
  process.exit(1);
});

// Helper function to check if a subscription is active
async function hasActiveSubscription(userId) {
  const now = new Date().toISOString();
  const subscription = await db.get(
    'SELECT * FROM subscriptions WHERE userId = ? AND expiresAt > ? AND status = "active" ORDER BY expiresAt DESC LIMIT 1',
    [userId, now]
  );
  return subscription !== undefined;
}

// Helper function to get subscription details
async function getSubscriptionDetails(userId) {
  const now = new Date().toISOString();
  return await db.get(
    'SELECT * FROM subscriptions WHERE userId = ? AND expiresAt > ? AND status = "active" ORDER BY expiresAt DESC LIMIT 1',
    [userId, now]
  );
}

// Routes
app.post('/register', async (req, res) => {
  try {
    const { numero, pin } = req.body;
    
    if (!numero || !pin) {
      return res.status(400).json({ success: false, message: 'Número e PIN são obrigatórios' });
    }
    
    if (pin.length !== 4 || isNaN(pin)) {
      return res.status(400).json({ success: false, message: 'PIN deve ter 4 dígitos numéricos' });
    }
    
    // Check if user already exists
    const existingUser = await db.get('SELECT * FROM users WHERE numero = ?', [numero]);
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Usuário já cadastrado' });
    }
    
    // Hash the PIN
    const hashedPin = await bcrypt.hash(pin, 10);
    
    // Insert the new user
    const result = await db.run('INSERT INTO users (numero, pin) VALUES (?, ?)', [numero, hashedPin]);
    
    res.status(201).json({ 
      success: true, 
      message: 'Usuário cadastrado com sucesso',
      userId: result.lastID
    });
  } catch (error) {
    console.error('Error in register:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { numero, pin } = req.body;
    
    if (!numero || !pin) {
      return res.status(400).json({ success: false, message: 'Número e PIN são obrigatórios' });
    }
    
    // Find the user
    const user = await db.get('SELECT * FROM users WHERE numero = ?', [numero]);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Usuário não encontrado' });
    }
    
    // Verify PIN
    const isValidPin = await bcrypt.compare(pin, user.pin);
    if (!isValidPin) {
      return res.status(401).json({ success: false, message: 'PIN incorreto' });
    }
    
    // Check if user has an active subscription
    const subscription = await getSubscriptionDetails(user.id);
    
    res.status(200).json({ 
      success: true, 
      message: 'Login realizado com sucesso',
      userId: user.id,
      numero: user.numero,
      hasActiveSubscription: !!subscription,
      subscription: subscription || null
    });
  } catch (error) {
    console.error('Error in login:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
});

app.post('/subscribe-emola', async (req, res) => {
  try {
    const { numero, userId, plan } = req.body;
    
    if (!numero || !userId || !plan) {
      return res.status(400).json({ success: false, message: 'Dados incompletos' });
    }
    
    // Define plan prices and duration
    const planConfig = {
      '7d': { price: 300, days: 7 },
      '15d': { price: 700, days: 15 },
      '30d': { price: 1200, days: 30 }
    };
    
    if (!planConfig[plan]) {
      return res.status(400).json({ success: false, message: 'Plano inválido' });
    }
    
    // Prepare payment request
    const paymentData = {
      carteira: "1746519798335x143095610732969980",
      numero: numero,
      quem_comprou: numero,
      valor: planConfig[plan].price.toString()
    };
    
    // Make payment request to eMola
    const response = await fetch('https://mozpayment.co.mz/api/1.1/wf/pagamentorotativoemola', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paymentData)
    });
    
    const paymentResult = await response.json();
    
    if (paymentResult.success === "yes") {
      // Payment successful, create subscription
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(now.getDate() + planConfig[plan].days);
      
      await db.run(
        'INSERT INTO subscriptions (userId, plan, createdAt, expiresAt, status) VALUES (?, ?, ?, ?, ?)',
        [userId, plan, now.toISOString(), expiresAt.toISOString(), 'active']
      );
      
      res.status(200).json({ 
        success: true, 
        message: 'Pagamento realizado com sucesso',
        plan: plan,
        expiresAt: expiresAt.toISOString()
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: 'Pagamento recusado',
        paymentResult 
      });
    }
  } catch (error) {
    console.error('Error in eMola payment:', error);
    res.status(500).json({ success: false, message: 'Erro no processamento do pagamento' });
  }
});

app.post('/subscribe-mpesa', async (req, res) => {
  try {
    const { numero, userId, plan } = req.body;
    
    if (!numero || !userId || !plan) {
      return res.status(400).json({ success: false, message: 'Dados incompletos' });
    }
    
    // Define plan prices and duration
    const planConfig = {
      '7d': { price: 300, days: 7 },
      '15d': { price: 700, days: 15 },
      '30d': { price: 1200, days: 30 }
    };
    
    if (!planConfig[plan]) {
      return res.status(400).json({ success: false, message: 'Plano inválido' });
    }
    
    // Prepare payment request
    const paymentData = {
      carteira: "1746519798335x143095610732969980",
      numero: numero,
      quem_comprou: numero,
      valor: planConfig[plan].price.toString()
    };
    
    // Make payment request to MPesa
    const response = await fetch('https://mozpayment.co.mz/api/1.1/wf/pagamentorotativompesa', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paymentData)
    });
    
    // Check response status
    const status = response.status;
    
    if (status === 200) {
      // Payment successful, create subscription
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(now.getDate() + planConfig[plan].days);
      
      await db.run(
        'INSERT INTO subscriptions (userId, plan, createdAt, expiresAt, status) VALUES (?, ?, ?, ?, ?)',
        [userId, plan, now.toISOString(), expiresAt.toISOString(), 'active']
      );
      
      res.status(200).json({ 
        success: true, 
        message: 'Pagamento realizado com sucesso',
        plan: plan,
        expiresAt: expiresAt.toISOString()
      });
    } else {
      let message = 'Pagamento recusado';
      
      if (status === 201) message = 'Erro na transação';
      else if (status === 422) message = 'Saldo insuficiente';
      else if (status === 400) message = 'PIN incorreto';
      
      res.status(status).json({ 
        success: false, 
        message: message
      });
    }
  } catch (error) {
    console.error('Error in MPesa payment:', error);
    res.status(500).json({ success: false, message: 'Erro no processamento do pagamento' });
  }
});

app.get('/status/:numero', async (req, res) => {
  try {
    const { numero } = req.params;
    
    // Find the user
    const user = await db.get('SELECT * FROM users WHERE numero = ?', [numero]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
    }
    
    // Get subscription details
    const subscription = await getSubscriptionDetails(user.id);
    
    if (subscription) {
      res.status(200).json({ 
        success: true, 
        active: true,
        plan: subscription.plan,
        expiresAt: subscription.expiresAt
      });
    } else {
      res.status(200).json({ 
        success: true, 
        active: false,
        message: 'Nenhuma assinatura ativa'
      });
    }
  } catch (error) {
    console.error('Error in status check:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
