const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Caminho do arquivo de chaves
const KEYS_FILE = path.join(__dirname, 'keys.json');

// Garantir que o arquivo keys.json existe
function ensureKeysFile() {
    if (!fs.existsSync(KEYS_FILE)) {
        fs.writeFileSync(KEYS_FILE, JSON.stringify({ keys: [] }));
    }
}

// Carregar chaves do arquivo
function loadKeys() {
    ensureKeysFile();
    const data = fs.readFileSync(KEYS_FILE, 'utf8');
    return JSON.parse(data);
}

// Salvar chaves no arquivo
function saveKeys(data) {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2));
}

// Gerar string aleatória para chaves
function generateRandomString(length = 10) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Calcular data de expiração com base no plano
function calculateExpiryDate(plan) {
    const now = new Date();
    const expiryDate = new Date(now);
    
    switch (plan) {
        case '7d':
            expiryDate.setDate(expiryDate.getDate() + 7);
            break;
        case '15d':
            expiryDate.setDate(expiryDate.getDate() + 15);
            break;
        case '30d':
            expiryDate.setDate(expiryDate.getDate() + 30);
            break;
        default:
            expiryDate.setDate(expiryDate.getDate() + 7);
    }
    
    return expiryDate;
}

// Calcular tempo restante em milissegundos
function calculateTimeRemaining(expiryDateStr) {
    const now = new Date();
    const expiryDate = new Date(expiryDateStr);
    return Math.max(0, expiryDate - now);
}

// Verificar status da chave
function checkKeyStatus(key) {
    const data = loadKeys();
    const keyInfo = data.keys.find(k => k.key === key);
    
    if (!keyInfo) {
        return { status: 'invalid' };
    }
    
    if (keyInfo.status === 'blocked') {
        return { status: 'blocked' };
    }
    
    const timeRemaining = calculateTimeRemaining(keyInfo.expiresAt);
    if (timeRemaining <= 0) {
        return { status: 'expired' };
    }
    
    return {
        status: 'valid',
        plano: keyInfo.plan,
        tempoRestante: timeRemaining
    };
}

// Rota de autenticação
app.post('/auth', (req, res) => {
    const { key } = req.body;
    
    if (!key) {
        return res.status(400).json({ error: 'Chave não fornecida' });
    }
    
    const keyStatus = checkKeyStatus(key);
    res.json(keyStatus);
});

// Rota para gerar previsão
app.post('/generate', (req, res) => {
    const { key } = req.body;
    
    if (!key) {
        return res.status(400).json({ error: 'Chave não fornecida' });
    }
    
    const keyStatus = checkKeyStatus(key);
    if (keyStatus.status !== 'valid') {
        return res.status(403).json({ error: 'Chave inválida ou expirada' });
    }
    
    // Gerar probabilidades aleatórias para o tabuleiro 5x5
    const probabilities = [];
    for (let i = 0; i < 25; i++) {
        probabilities.push(Math.floor(Math.random() * 100) + 1);
    }
    
    // Encontrar a casa com maior probabilidade
    let highestProb = 0;
    let recommendedTile = 0;
    
    for (let i = 0; i < probabilities.length; i++) {
        if (probabilities[i] > highestProb) {
            highestProb = probabilities[i];
            recommendedTile = i;
        }
    }
    
    res.json({
        success: true,
        probabilities,
        recommended: recommendedTile
    });
});

// Rota para gerar nova chave
app.post('/generateKey', (req, res) => {
    const { plan } = req.body;
    
    if (!plan || !['7d', '15d', '30d'].includes(plan)) {
        return res.status(400).json({ error: 'Plano inválido' });
    }
    
    const data = loadKeys();
    const now = new Date();
    const expiryDate = calculateExpiryDate(plan);
    
    const newKey = {
        key: generateRandomString(),
        plan,
        createdAt: now.toISOString(),
        status: 'active',
        expiresAt: expiryDate.toISOString()
    };
    
    data.keys.push(newKey);
    saveKeys(data);
    
    res.json(newKey);
});

// Iniciar o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    ensureKeysFile();
});
