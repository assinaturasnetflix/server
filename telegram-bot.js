const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configurações
const KEYS_FILE = path.join(__dirname, 'keys.json');
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '7661749164:AAGpaI0ugskoRuH98zLpQ7hql-vOuPBnnVg'; // Substitua pelo token do seu bot
const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID || '6547496177'; // Substitua pelo seu ID do Telegram

// Inicialização do bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Utilitários
function loadKeys() {
  try {
    if (!fs.existsSync(KEYS_FILE)) {
      fs.writeFileSync(KEYS_FILE, JSON.stringify({ keys: [] }));
      return { keys: [] };
    }
    const data = fs.readFileSync(KEYS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Erro ao carregar chaves:', error);
    return { keys: [] };
  }
}

function saveKeys(data) {
  try {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Erro ao salvar chaves:', error);
    return false;
  }
}

function daysToMs(days) {
  return days * 24 * 60 * 60 * 1000;
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

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

// Verificar se o usuário é administrador
function isAdmin(userId) {
  return userId.toString() === ADMIN_ID.toString();
}

// Teclado de opções
const adminKeyboard = {
  reply_markup: {
    keyboard: [
      ['Criar chave 7 dias', 'Criar chave 15 dias'],
      ['Criar chave 30 dias', 'Listar chaves'],
      ['Bloquear chave', 'Deletar chave']
    ],
    resize_keyboard: true
  }
};

// Manipuladores de comandos
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (isAdmin(userId)) {
    bot.sendMessage(chatId, 'Bem-vindo ao AC MINES HACK Admin Bot!\n\nEscolha uma opção:', adminKeyboard);
  } else {
    bot.sendMessage(chatId, 'Este bot é restrito apenas para administradores.');
  }
});

bot.onText(/Criar chave 7 dias/, (msg) => {
  handleCreateKey(msg, '7d');
});

bot.onText(/Criar chave 15 dias/, (msg) => {
  handleCreateKey(msg, '15d');
});

bot.onText(/Criar chave 30 dias/, (msg) => {
  handleCreateKey(msg, '30d');
});

bot.onText(/Listar chaves/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!isAdmin(userId)) {
    bot.sendMessage(chatId, 'Acesso negado.');
    return;
  }
  
  const data = loadKeys();
  
  if (data.keys.length === 0) {
    bot.sendMessage(chatId, 'Nenhuma chave encontrada.');
    return;
  }
  
  // Formatar chaves em grupos de 10
  const keyGroups = [];
  for (let i = 0; i < data.keys.length; i += 10) {
    keyGroups.push(data.keys.slice(i, i + 10));
  }
  
  // Enviar cada grupo em mensagens separadas para evitar limite de mensagem
  for (let i = 0; i < keyGroups.length; i++) {
    const keys = keyGroups[i];
    let message = `📋 Chaves (grupo ${i+1}/${keyGroups.length}):\n\n`;
    
    keys.forEach((keyData, index) => {
      const now = Date.now();
      const status = keyData.status === 'blocked' ? 'BLOQUEADA' : 
                    (now > keyData.expireAt ? 'EXPIRADA' : 'ATIVA');
      
      message += `🔑 <code>${keyData.key}</code>\n`;
      message += `📆 Plano: ${keyData.plan}\n`;
      message += `⏳ Criada: ${formatDate(keyData.createdAt)}\n`;
      message += `⌛ Expira: ${formatDate(keyData.expireAt)}\n`;
      message += `📊 Status: ${status}\n\n`;
    });
    
    bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
  }
});

bot.onText(/Bloquear chave/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!isAdmin(userId)) {
    bot.sendMessage(chatId, 'Acesso negado.');
    return;
  }
  
  bot.sendMessage(chatId, 'Envie a chave que deseja bloquear:');
  bot.once('message', (response) => {
    if (response.from.id !== userId) return;
    
    const key = response.text.trim();
    const data = loadKeys();
    const keyIndex = data.keys.findIndex(k => k.key === key);
    
    if (keyIndex === -1) {
      bot.sendMessage(chatId, '❌ Chave não encontrada.');
      return;
    }
    
    data.keys[keyIndex].status = 'blocked';
    
    if (saveKeys(data)) {
      bot.sendMessage(chatId, `✅ Chave ${key} bloqueada com sucesso.`);
    } else {
      bot.sendMessage(chatId, '❌ Erro ao bloquear a chave.');
    }
  });
});

bot.onText(/Deletar chave/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!isAdmin(userId)) {
    bot.sendMessage(chatId, 'Acesso negado.');
    return;
  }
  
  bot.sendMessage(chatId, 'Envie a chave que deseja deletar:');
  bot.once('message', (response) => {
    if (response.from.id !== userId) return;
    
    const key = response.text.trim();
    const data = loadKeys();
    const keyIndex = data.keys.findIndex(k => k.key === key);
    
    if (keyIndex === -1) {
      bot.sendMessage(chatId, '❌ Chave não encontrada.');
      return;
    }
    
    data.keys.splice(keyIndex, 1);
    
    if (saveKeys(data)) {
      bot.sendMessage(chatId, `✅ Chave ${key} deletada com sucesso.`);
    } else {
      bot.sendMessage(chatId, '❌ Erro ao deletar a chave.');
    }
  });
});

// Função para criar chaves
function handleCreateKey(msg, plan) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!isAdmin(userId)) {
    bot.sendMessage(chatId, 'Acesso negado.');
    return;
  }
  
  const data = loadKeys();
  const newKey = generateKey(plan);
  
  data.keys.push(newKey);
  
  if (saveKeys(data)) {
    let message = '✅ Chave criada com sucesso:\n\n';
    message += `🔑 <code>${newKey.key}</code>\n`;
    message += `📆 Plano: ${plan}\n`;
    message += `⏳ Criada: ${formatDate(newKey.createdAt)}\n`;
    message += `⌛ Expira: ${formatDate(newKey.expireAt)}\n`;
    
    bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
  } else {
    bot.sendMessage(chatId, '❌ Erro ao criar a chave.');
  }
}

// Manipulador de mensagens gerais
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  
  // Ignorar comandos já processados
  if (text && (
    text.startsWith('/') || 
    text.startsWith('Criar chave') ||
    text === 'Listar chaves' ||
    text === 'Bloquear chave' ||
    text === 'Deletar chave'
  )) {
    return;
  }
  
  // Se não é admin, ignorar
  if (!isAdmin(userId)) {
    bot.sendMessage(chatId, 'Este bot é restrito apenas para administradores.');
    return;
  }
});

// Iniciar o bot
console.log('Bot do Telegram iniciado!');

// Tratamento de erros
bot.on('polling_error', (error) => {
  console.error('Erro no polling do bot:', error);
});

// Exportar o bot para uso externo (opcional)
module.exports = bot;
