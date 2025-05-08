const express = require('express');
const path = require('path');
const cors = require('cors');
const { generateKey, getAllKeys, verifyKey } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Endpoints da API

// Verificar chave
app.post('/api/verify-key', async (req, res) => {
  try {
    const { key } = req.body;
    
    if (!key) {
      return res.status(400).json({ error: 'Chave não fornecida' });
    }
    
    const result = await verifyKey(key);
    res.json(result);
  } catch (error) {
    console.error('Erro ao verificar chave:', error);
    res.status(500).json({ error: 'Erro ao verificar chave' });
  }
});

// Gerar novo sinal
app.post('/api/generate-signal', async (req, res) => {
  try {
    const { key } = req.body;
    
    if (!key) {
      return res.status(400).json({ error: 'Chave não fornecida' });
    }
    
    // Verificar se a chave é válida
    const keyInfo = await verifyKey(key);
    if (!keyInfo.valid) {
      return res.status(403).json({ error: 'Chave inválida ou expirada' });
    }
    
    // Gerar um novo tabuleiro de minas 5x5
    const board = generateNewBoard();
    
    res.json({ board });
  } catch (error) {
    console.error('Erro ao gerar novo sinal:', error);
    res.status(500).json({ error: 'Erro ao gerar novo sinal' });
  }
});

// Gerar nova chave (admin)
app.post('/api/admin/generate-key', async (req, res) => {
  try {
    const { plan } = req.body;
    
    if (!plan || !['7d', '15d', '30d'].includes(plan)) {
      return res.status(400).json({ error: 'Plano inválido' });
    }
    
    const result = await generateKey(plan);
    res.json(result);
  } catch (error) {
    console.error('Erro ao gerar chave:', error);
    res.status(500).json({ error: 'Erro ao gerar chave' });
  }
});

// Obter todas as chaves (admin)
app.get('/api/admin/keys', async (req, res) => {
  try {
    const keys = await getAllKeys();
    res.json(keys);
  } catch (error) {
    console.error('Erro ao obter chaves:', error);
    res.status(500).json({ error: 'Erro ao obter chaves' });
  }
});

// Função para gerar um novo tabuleiro de minas
function generateNewBoard() {
  const board = [];
  
  for (let i = 0; i < 5; i++) {
    const row = [];
    for (let j = 0; j < 5; j++) {
      // Gerar um número aleatório entre 0 e 100
      const percentage = Math.floor(Math.random() * 101);
      
      // Definir a cor com base na porcentagem
      let color;
      if (percentage >= 70) {
        color = 'green';
      } else if (percentage >= 40) {
        color = 'orange';
      } else {
        color = 'red';
      }
      
      row.push({ percentage, color });
    }
    board.push(row);
  }
  
  return board;
}

// Rota para servir a página principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota para servir a página de administração
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Iniciar o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
