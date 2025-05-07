const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Utilitários
const KEYS_FILE = path.join(__dirname, 'keys.json');

// Garante que o arquivo de chaves existe
if (!fs.existsSync(KEYS_FILE)) {
  fs.writeFileSync(KEYS_FILE, JSON.stringify({ keys: [] }));
}

// Carregar chaves
function loadKeys() {
  try {
    const data = fs.readFileSync(KEYS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Erro ao carregar chaves:', error);
    return { keys: [] };
  }
}

// Salvar chaves
function saveKeys(data) {
  try {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Erro ao salvar chaves:', error);
    return false;
  }
}

// Converter dias para milissegundos
function daysToMs(days) {
  return days * 24 * 60 * 60 * 1000;
}

// Gerar uma nova chave
function generateKey(plan) {
  const key = crypto.randomBytes(6).toString('hex');
  const now = Date.now();
  let expireAt;
  
  switch (plan) {
    case '7d':
      expireAt = now + daysToMs(7);
      break;
    case '15d':
      expireAt = now + daysToMs(15);
      break;
    case '30d':
      expireAt = now + daysToMs(30);
      break;
    default:
      expireAt = now + daysToMs(7);
  }
  
  return {
    key,
    plan,
    createdAt: now,
    expireAt,
    status: 'active'
  };
}

// Rotas
app.post('/auth', (req, res) => {
  const { key } = req.body;
  
  if (!key) {
    return res.status(400).json({ error: 'Chave não fornecida' });
  }
  
  const data = loadKeys();
  const keyData = data.keys.find(k => k.key === key);
  
  if (!keyData) {
    return res.status(404).json({ status: 'invalid', message: 'Chave inválida' });
  }
  
  const now = Date.now();
  
  if (keyData.status === 'blocked') {
    return res.json({ status: 'blocked', message: 'Esta chave foi bloqueada' });
  }
  
  if (now > keyData.expireAt) {
    return res.json({ status: 'expired', message: 'Chave expirada' });
  }
  
  const tempoRestante = keyData.expireAt - now;
  
  return res.json({
    status: 'valid',
    plano: keyData.plan,
    tempoRestante,
    message: 'Autenticação bem-sucedida'
  });
});

app.post('/generate', (req, res) => {
  // Gera uma casa segura aleatória (1-25)
  const casaSegura = Math.floor(Math.random() * 25) + 1;
  
  // Gera probabilidades para todas as 25 casas
  const tabuleiro = Array(25).fill().map((_, index) => {
    const numero = index + 1;
    let probabilidade;
    
    if (numero === casaSegura) {
      probabilidade = Math.floor(Math.random() * 21) + 80; // 80-100%
    } else {
      probabilidade = Math.floor(Math.random() * 41) + 10; // 10-50%
    }
    
    return {
      numero,
      probabilidade,
      seguro: numero === casaSegura
    };
  });
  
  res.json({
    casaSegura,
    tabuleiro
  });
});

// API para o bot Telegram
app.post('/api/keys/create', (req, res) => {
  const { plan, adminKey } = req.body;
  
  // Em um sistema real, verificaríamos uma chave de API aqui
  if (adminKey !== process.env.ADMIN_KEY && adminKey !== 'ac-mines-admin-key') {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  
  if (!['7d', '15d', '30d'].includes(plan)) {
    return res.status(400).json({ error: 'Plano inválido' });
  }
  
  const data = loadKeys();
  const newKey = generateKey(plan);
  
  data.keys.push(newKey);
  
  if (saveKeys(data)) {
    res.json({ success: true, key: newKey });
  } else {
    res.status(500).json({ error: 'Erro ao salvar a chave' });
  }
});

app.post('/api/keys/list', (req, res) => {
  const { adminKey } = req.body;
  
  if (adminKey !== process.env.ADMIN_KEY && adminKey !== 'ac-mines-admin-key') {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  
  const data = loadKeys();
  res.json({ keys: data.keys });
});

app.post('/api/keys/block', (req, res) => {
  const { key, adminKey } = req.body;
  
  if (adminKey !== process.env.ADMIN_KEY && adminKey !== 'ac-mines-admin-key') {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  
  const data = loadKeys();
  const keyIndex = data.keys.findIndex(k => k.key === key);
  
  if (keyIndex === -1) {
    return res.status(404).json({ error: 'Chave não encontrada' });
  }
  
  data.keys[keyIndex].status = 'blocked';
  
  if (saveKeys(data)) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'Erro ao bloquear a chave' });
  }
});

app.post('/api/keys/delete', (req, res) => {
  const { key, adminKey } = req.body;
  
  if (adminKey !== process.env.ADMIN_KEY && adminKey !== 'ac-mines-admin-key') {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  
  const data = loadKeys();
  const keyIndex = data.keys.findIndex(k => k.key === key);
  
  if (keyIndex === -1) {
    return res.status(404).json({ error: 'Chave não encontrada' });
  }
  
  data.keys.splice(keyIndex, 1);
  
  if (saveKeys(data)) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'Erro ao deletar a chave' });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
