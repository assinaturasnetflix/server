const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');
const moment = require('moment');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Inicializar banco de dados
db.initDatabase();

// Rotas
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Rota para gerar nova chave
app.post('/api/keys', (req, res) => {
  const { type } = req.body;
  
  if (!type || ![7, 15, 30].includes(parseInt(type))) {
    return res.status(400).json({ success: false, message: 'Tipo de plano inválido. Use 7, 15 ou 30 dias.' });
  }
  
  const keyCode = uuidv4().substring(0, 8).toUpperCase();
  const createdAt = moment().format('YYYY-MM-DD HH:mm:ss');
  const expiresAt = moment().add(parseInt(type), 'days').format('YYYY-MM-DD HH:mm:ss');
  
  db.createKey(keyCode, type, createdAt, expiresAt, (err) => {
    if (err) {
      console.error('Erro ao criar chave:', err);
      return res.status(500).json({ success: false, message: 'Erro ao criar chave.' });
    }
    
    res.json({
      success: true,
      key: {
        code: keyCode,
        type,
        createdAt,
        expiresAt
      }
    });
  });
});

// Rota para validar chave
app.post('/api/keys/validate', (req, res) => {
  const { keyCode } = req.body;
  
  if (!keyCode) {
    return res.status(400).json({ success: false, message: 'Código da chave é obrigatório.' });
  }
  
  db.getKey(keyCode, (err, key) => {
    if (err) {
      console.error('Erro ao validar chave:', err);
      return res.status(500).json({ success: false, message: 'Erro ao validar chave.' });
    }
    
    if (!key) {
      return res.status(404).json({ success: false, message: 'Chave não encontrada.' });
    }
    
    const now = moment();
    const expiresAt = moment(key.expiresAt);
    const isValid = now.isBefore(expiresAt);
    const daysRemaining = isValid ? expiresAt.diff(now, 'days') : 0;
    
    res.json({
      success: true,
      key: {
        code: key.code,
        type: key.type,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        isValid,
        daysRemaining
      }
    });
  });
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
