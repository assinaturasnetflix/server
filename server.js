const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const fetch = require('node-fetch');
const bcrypt = require('bcryptjs');

// Initialize app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Database setup
const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

// Initialize database tables
function initializeDatabase() {
  db.serialize(() => {
    // Create users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT UNIQUE,
      pin TEXT
    )`);

    // Create subscriptions table
    db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      plan TEXT,
      createdAt TEXT,
      expiresAt TEXT,
      status TEXT DEFAULT 'active',
      FOREIGN KEY(userId) REFERENCES users(id)
    )`);
    
    console.log('Database tables initialized');
  });
}

// MozPayment API configuration
const PAYMENT_CONFIG = {
  carteira: "1746519798335x143095610732969980",
  eMolaEndpoint: "https://mozpayment.co.mz/api/1.1/wf/pagamentorotativoemola",
  mPesaEndpoint: "https://mozpayment.co.mz/api/1.1/wf/pagamentorotativompesa"
};

// Subscription plan details
const PLANS = {
  '7d': { days: 7, price: 300 },
  '15d': { days: 15, price: 700 },
  '30d': { days: 30, price: 1200 }
};

// Helper function to hash PIN
async function hashPin(pin) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(pin, salt);
}

// Helper function to compare PIN
async function comparePin(pin, hash) {
  return await bcrypt.compare(pin, hash);
}

// Helper function to calculate expiration date
function calculateExpiryDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

// Register endpoint
app.post('/register', async (req, res) => {
  const { numero, pin } = req.body;
  
  if (!numero || !pin) {
    return res.status(400).json({ error: 'Número e PIN são obrigatórios' });
  }
  
  if (pin.length !== 4 || isNaN(pin)) {
    return res.status(400).json({ error: 'PIN deve ter 4 dígitos numéricos' });
  }

  try {
    const hashedPin = await hashPin(pin);
    
    db.get('SELECT * FROM users WHERE numero = ?', [numero], (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Erro ao verificar usuário' });
      }
      
      if (user) {
        return res.status(400).json({ error: 'Número de telefone já registrado' });
      }
      
      db.run('INSERT INTO users (numero, pin) VALUES (?, ?)', [numero, hashedPin], function(err) {
        if (err) {
          return res.status(500).json({ error: 'Erro ao registrar usuário' });
        }
        
        res.status(201).json({ 
          success: true, 
          message: 'Usuário registrado com sucesso',
          userId: this.lastID
        });
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao processar requisição' });
  }
});

// Login endpoint
app.post('/login', async (req, res) => {
  const { numero, pin } = req.body;
  
  if (!numero || !pin) {
    return res.status(400).json({ error: 'Número e PIN são obrigatórios' });
  }
  
  db.get('SELECT * FROM users WHERE numero = ?', [numero], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao verificar usuário' });
    }
    
    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }
    
    try {
      const isPinValid = await comparePin(pin, user.pin);
      
      if (!isPinValid) {
        return res.status(401).json({ error: 'PIN inválido' });
      }
      
      res.json({ 
        success: true, 
        message: 'Login bem-sucedido', 
        userId: user.id,
        numero: user.numero
      });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao processar requisição' });
    }
  });
});

// Subscription status endpoint
app.get('/status/:numero', (req, res) => {
  const { numero } = req.params;
  
  if (!numero) {
    return res.status(400).json({ error: 'Número é obrigatório' });
  }
  
  db.get('SELECT id FROM users WHERE numero = ?', [numero], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao verificar usuário' });
    }
    
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    const now = new Date().toISOString();
    
    db.get(`
      SELECT * FROM subscriptions 
      WHERE userId = ? AND status = 'active' AND expiresAt > ? 
      ORDER BY expiresAt DESC LIMIT 1
    `, [user.id, now], (err, subscription) => {
      if (err) {
        return res.status(500).json({ error: 'Erro ao verificar assinatura' });
      }
      
      if (!subscription) {
        return res.json({ 
          active: false,
          message: 'Sem assinatura ativa'
        });
      }
      
      res.json({
        active: true,
        subscription: {
          plan: subscription.plan,
          expiresAt: subscription.expiresAt
        }
      });
    });
  });
});

// Subscribe endpoint
app.post('/subscribe', async (req, res) => {
  const { numero, plan, paymentMethod } = req.body;
  
  if (!numero || !plan || !paymentMethod) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }
  
  if (!PLANS[plan]) {
    return res.status(400).json({ error: 'Plano inválido' });
  }
  
  if (paymentMethod !== 'mpesa' && paymentMethod !== 'emola') {
    return res.status(400).json({ error: 'Método de pagamento inválido' });
  }
  
  db.get('SELECT * FROM users WHERE numero = ?', [numero], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao verificar usuário' });
    }
    
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    const planDetails = PLANS[plan];
    const valor = planDetails.price.toString();
    
    try {
      // Payment request data
      const paymentData = {
        carteira: PAYMENT_CONFIG.carteira,
        numero: numero,
        quem_comprou: numero, // Using phone number as name
        valor: valor
      };
      
      // Select payment endpoint based on method
      const paymentEndpoint = paymentMethod === 'mpesa' 
        ? PAYMENT_CONFIG.mPesaEndpoint 
        : PAYMENT_CONFIG.eMolaEndpoint;
      
      // Process payment
      const paymentResponse = await fetch(paymentEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(paymentData)
      });
      
      const paymentResult = await paymentResponse.json();
      
      // Handle payment response
      if (paymentMethod === 'mpesa') {
        // MPesa has different response codes
        if (paymentResponse.status === 200) {
          // Payment successful
          const createdAt = new Date().toISOString();
          const expiresAt = calculateExpiryDate(planDetails.days);
          
          db.run(
            'INSERT INTO subscriptions (userId, plan, createdAt, expiresAt) VALUES (?, ?, ?, ?)',
            [user.id, plan, createdAt, expiresAt],
            function(err) {
              if (err) {
                return res.status(500).json({ error: 'Erro ao salvar assinatura' });
              }
              
              res.json({
                success: true,
                message: 'Pagamento processado com sucesso',
                subscription: {
                  id: this.lastID,
                  plan,
                  createdAt,
                  expiresAt
                }
              });
            }
          );
        } else if (paymentResponse.status === 400) {
          res.status(400).json({ error: 'PIN errado' });
        } else if (paymentResponse.status === 422) {
          res.status(422).json({ error: 'Saldo insuficiente' });
        } else {
          res.status(400).json({ error: 'Erro no processamento do pagamento' });
        }
      } else {
        // eMola has simpler response
        if (paymentResult.success === "yes") {
          // Payment successful
          const createdAt = new Date().toISOString();
          const expiresAt = calculateExpiryDate(planDetails.days);
          
          db.run(
            'INSERT INTO subscriptions (userId, plan, createdAt, expiresAt) VALUES (?, ?, ?, ?)',
            [user.id, plan, createdAt, expiresAt],
            function(err) {
              if (err) {
                return res.status(500).json({ error: 'Erro ao salvar assinatura' });
              }
              
              res.json({
                success: true,
                message: 'Pagamento processado com sucesso',
                subscription: {
                  id: this.lastID,
                  plan,
                  createdAt,
                  expiresAt
                }
              });
            }
          );
        } else {
          res.status(400).json({ error: 'Erro no processamento do pagamento' });
        }
      }
    } catch (error) {
      console.error('Payment processing error:', error);
      res.status(500).json({ error: 'Erro ao processar pagamento' });
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
