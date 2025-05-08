// index.js - Servidor principal do Caçador de Rosas
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const app = express();
const cors = require('cors');
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static(__dirname));

// Configuração do banco de dados SQLite
const db = new sqlite3.Database('./cacador-rosas.db', (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados:', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite');
    // Criar tabela de chaves se não existir
    db.run(`CREATE TABLE IF NOT EXISTS chaves (
      id TEXT PRIMARY KEY,
      codigo TEXT NOT NULL UNIQUE,
      tipo INTEGER NOT NULL,
      data_criacao TEXT NOT NULL,
      data_expiracao TEXT NOT NULL
    )`);
  }
});

// Rotas estáticas
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API para gerar nova chave
app.post('/api/chaves', (req, res) => {
  const { tipo } = req.body;
  
  if (!tipo || ![7, 15, 30].includes(Number(tipo))) {
    return res.status(400).json({ success: false, message: 'Tipo de plano inválido. Use 7, 15 ou 30 dias.' });
  }
  
  const tipoNum = Number(tipo);
  const id = uuidv4();
  const codigo = generateKey();
  const dataCriacao = new Date().toISOString();
  
  // Calcular data de expiração
  const dataExpiracao = new Date();
  dataExpiracao.setDate(dataExpiracao.getDate() + tipoNum);
  
  const sql = `INSERT INTO chaves (id, codigo, tipo, data_criacao, data_expiracao) 
               VALUES (?, ?, ?, ?, ?)`;
  
  db.run(sql, [id, codigo, tipoNum, dataCriacao, dataExpiracao.toISOString()], function(err) {
    if (err) {
      return res.status(500).json({ success: false, message: 'Erro ao gerar chave', error: err.message });
    }
    
    res.status(201).json({
      success: true,
      chave: {
        codigo,
        tipo: tipoNum,
        data_criacao: dataCriacao,
        data_expiracao: dataExpiracao.toISOString()
      }
    });
  });
});

// API para validar chave
app.get('/api/chaves/validar/:codigo', (req, res) => {
  const { codigo } = req.params;
  
  if (!codigo) {
    return res.status(400).json({ success: false, message: 'Código de chave não fornecido' });
  }
  
  const sql = `SELECT * FROM chaves WHERE codigo = ?`;
  
  db.get(sql, [codigo], (err, chave) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Erro ao validar chave', error: err.message });
    }
    
    if (!chave) {
      return res.status(404).json({ success: false, message: 'Chave não encontrada' });
    }
    
    const dataAtual = new Date();
    const dataExpiracao = new Date(chave.data_expiracao);
    const valida = dataAtual <= dataExpiracao;
    
    // Calcular tempo restante em dias
    const diferencaTempo = dataExpiracao.getTime() - dataAtual.getTime();
    const diasRestantes = Math.ceil(diferencaTempo / (1000 * 3600 * 24));
    
    res.json({
      success: true,
      chave: {
        tipo: chave.tipo,
        valida,
        dias_restantes: valida ? diasRestantes : 0,
        data_expiracao: chave.data_expiracao
      }
    });
  });
});

// Função auxiliar para gerar código de chave aleatório
function generateKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) result += '-';
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Iniciar servidor
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
