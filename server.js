// server.js - Backend para AC MINES HACK
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bcrypt = require('bcrypt');
const fetch = require('node-fetch');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Configurações do middleware
app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));

// Inicialização do banco de dados SQLite
const db = new sqlite3.Database('./acmines.db', (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados', err);
  } else {
    console.log('Conectado ao banco de dados SQLite');
    initializeDatabase();
  }
});

// Criação das tabelas necessárias
function initializeDatabase() {
  db.serialize(() => {
    // Tabela de usuários
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT UNIQUE,
      pin TEXT
    )`);

    // Tabela de assinaturas
    db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      plan TEXT,
      createdAt TEXT,
      expiresAt TEXT,
      status TEXT DEFAULT 'active',
      FOREIGN KEY(userId) REFERENCES users(id)
    )`);
    
    console.log('Tabelas criadas ou já existentes');
  });
}

// Endpoint para registro de usuário
app.post('/register', async (req, res) => {
  const { numero, pin } = req.body;
  
  if (!numero || !pin) {
    return res.status(400).json({ success: false, message: 'Número e PIN são obrigatórios' });
  }
  
  if (pin.length !== 4 || isNaN(Number(pin))) {
    return res.status(400).json({ success: false, message: 'PIN deve ter 4 dígitos numéricos' });
  }

  try {
    // Verificar se o usuário já existe
    db.get('SELECT * FROM users WHERE numero = ?', [numero], async (err, user) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Erro interno do servidor' });
      }
      
      if (user) {
        return res.status(409).json({ success: false, message: 'Número já registrado' });
      }
      
      // Hash do PIN antes de salvar
      const hashedPin = await bcrypt.hash(pin, 10);
      
      // Inserir novo usuário
      db.run('INSERT INTO users (numero, pin) VALUES (?, ?)', [numero, hashedPin], function(err) {
        if (err) {
          console.error(err);
          return res.status(500).json({ success: false, message: 'Erro ao registrar usuário' });
        }
        
        return res.status(201).json({ 
          success: true, 
          message: 'Usuário registrado com sucesso',
          userId: this.lastID
        });
      });
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
});

// Endpoint para login
app.post('/login', (req, res) => {
  const { numero, pin } = req.body;
  
  if (!numero || !pin) {
    return res.status(400).json({ success: false, message: 'Número e PIN são obrigatórios' });
  }
  
  db.get('SELECT * FROM users WHERE numero = ?', [numero], async (err, user) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Erro interno do servidor' });
    }
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
    }
    
    // Verificar PIN
    const pinMatch = await bcrypt.compare(pin, user.pin);
    if (!pinMatch) {
      return res.status(401).json({ success: false, message: 'PIN incorreto' });
    }
    
    // Verificar se há uma assinatura ativa
    db.get(
      `SELECT * FROM subscriptions 
       WHERE userId = ? AND status = 'active' AND expiresAt > datetime('now')`, 
      [user.id], 
      (err, subscription) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ success: false, message: 'Erro ao verificar assinatura' });
        }
        
        return res.status(200).json({
          success: true,
          message: 'Login bem-sucedido',
          userId: user.id,
          numero: user.numero,
          subscription: subscription || null
        });
      }
    );
  });
});

// Endpoint para verificar status da assinatura
app.get('/status/:numero', (req, res) => {
  const { numero } = req.params;
  
  db.get('SELECT id FROM users WHERE numero = ?', [numero], (err, user) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Erro interno do servidor' });
    }
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
    }
    
    db.get(
      `SELECT * FROM subscriptions 
       WHERE userId = ? AND status = 'active' AND expiresAt > datetime('now')`,
      [user.id],
      (err, subscription) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ success: false, message: 'Erro ao verificar assinatura' });
        }
        
        if (!subscription) {
          return res.status(200).json({ 
            success: true, 
            hasActiveSubscription: false 
          });
        }
        
        return res.status(200).json({
          success: true,
          hasActiveSubscription: true,
          plan: subscription.plan,
          expiresAt: subscription.expiresAt
        });
      }
    );
  });
});

// Endpoint para processar assinatura
app.post('/subscribe', (req, res) => {
  const { userId, numero, plan, paymentMethod } = req.body;
  
  if (!userId || !numero || !plan || !paymentMethod) {
    return res.status(400).json({ 
      success: false, 
      message: 'Dados incompletos para assinatura' 
    });
  }
  
  // Determinar valor com base no plano
  let valor;
  let diasDuracao;
  
  switch (plan) {
    case '7d':
      valor = "300";
      diasDuracao = 7;
      break;
    case '15d':
      valor = "700";
      diasDuracao = 15;
      break;
    case '30d':
      valor = "1200";
      diasDuracao = 30;
      break;
    default:
      return res.status(400).json({ success: false, message: 'Plano inválido' });
  }
  
  // Configurar dados de pagamento
  const paymentData = {
    carteira: "1746519798335x143095610732969980",
    numero: numero,
    quem_comprou: numero, // Usando o número como identificador do comprador
    valor: valor
  };
  
  let paymentEndpoint = '';
  
  // Determinar endpoint com base no método de pagamento
  if (paymentMethod === 'mpesa') {
    paymentEndpoint = 'https://mozpayment.co.mz/api/1.1/wf/pagamentorotativompesa';
  } else if (paymentMethod === 'emola') {
    paymentEndpoint = 'https://mozpayment.co.mz/api/1.1/wf/pagamentorotativoemola';
  } else {
    return res.status(400).json({ success: false, message: 'Método de pagamento inválido' });
  }
  
  // Processar pagamento
  fetch(paymentEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(paymentData)
  })
  .then(response => {
    // Verificar status para MPesa
    if (paymentMethod === 'mpesa') {
      if (response.status === 200) {
        return { success: "yes" };
      } else if (response.status === 201) {
        throw new Error('Erro no pagamento MPesa');
      } else if (response.status === 400) {
        throw new Error('PIN errado no MPesa');
      } else if (response.status === 422) {
        throw new Error('Saldo insuficiente');
      } else {
        throw new Error('Erro desconhecido no pagamento');
      }
    }
    // Para eMola, processar normalmente a resposta
    return response.json();
  })
  .then(data => {
    if (data.success === "yes") {
      // Calcular datas de início e expiração
      const createdAt = new Date().toISOString();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + diasDuracao);
      
      // Inserir assinatura no banco de dados
      db.run(
        `INSERT INTO subscriptions (userId, plan, createdAt, expiresAt, status) 
         VALUES (?, ?, ?, ?, 'active')`,
        [userId, plan, createdAt, expiresAt.toISOString()],
        function(err) {
          if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: 'Erro ao salvar assinatura' });
          }
          
          return res.status(200).json({
            success: true,
            message: 'Assinatura ativada com sucesso',
            subscriptionId: this.lastID,
            plan: plan,
            expiresAt: expiresAt.toISOString()
          });
        }
      );
    } else {
      return res.status(400).json({ success: false, message: 'Falha no pagamento' });
    }
  })
  .catch(error => {
    console.error('Erro no pagamento:', error);
    return res.status(400).json({ success: false, message: error.message });
  });
});

// Iniciar o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
