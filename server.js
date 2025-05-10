const express = require('express');
const puppeteer = require('puppeteer');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

// Configurações
const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '7661749164:AAGpaI0ugskoRuH98zLpQ7hql-vOuPBnnVg';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '6547496177';
const QR_CHECK_INTERVAL = 5000; // 5 segundos

// Inicializar aplicação Express
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Variáveis globais
let browser;
let page;
let db;
let lastQrCode = '';
let isLoggedIn = false;
let qrCheckInterval;

// Inicializar banco de dados
async function initializeDatabase() {
  // Garantir que o diretório data existe
  if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data');
  }

  db = await open({
    filename: './data/whatsapp_automation.db',
    driver: sqlite3.Database
  });

  // Criar tabelas se não existirem
  await db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE,
      name TEXT,
      group_name TEXT,
      last_message_date TEXT
    );
    
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT,
      message TEXT,
      direction TEXT,
      timestamp TEXT,
      status TEXT
    );
    
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE,
      value TEXT
    );
    
    CREATE TABLE IF NOT EXISTS conversations (
      phone TEXT PRIMARY KEY,
      status TEXT,
      last_interaction TEXT,
      messages_sent INTEGER DEFAULT 0,
      awaiting_reply BOOLEAN DEFAULT 0
    );
  `);

  // Inserir configurações padrão se não existirem
  const greeting_messages = [
    "Olá",
    "Tudo bem?",
    "Como vai?",
    "Oi, tudo certo?",
    "E aí, tudo bem?"
  ];
  
  await db.run(`
    INSERT OR IGNORE INTO settings (key, value) 
    VALUES ('greeting_messages', ?)
  `, [JSON.stringify(greeting_messages)]);
  
  await db.run(`
    INSERT OR IGNORE INTO settings (key, value) 
    VALUES ('auto_reply', 'Obrigado por responder! Como posso ajudar?')
  `);
  
  console.log('Database initialized successfully');
}

// Inicializar Puppeteer e WhatsApp Web
async function initializePuppeteer() {
  try {
    console.log('Initializing Puppeteer...');
    
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });
    
    page = await browser.newPage();
    
    // Navegar para o WhatsApp Web
    await page.goto('https://web.whatsapp.com/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    console.log('WhatsApp Web loaded');
    
    // Iniciar monitoramento do QR code
    qrCheckInterval = setInterval(checkQrCode, QR_CHECK_INTERVAL);
    
    // Verificar se já está logado
    page.on('load', async () => {
      const isLogged = await checkIfLoggedIn();
      if (isLogged && !isLoggedIn) {
        console.log('WhatsApp logged in successfully');
        isLoggedIn = true;
        clearInterval(qrCheckInterval);
        
        // Iniciar monitoramento de mensagens recebidas
        startMessageMonitoring();
        
        // Iniciar gerenciador de conversas
        startConversationManager();
      }
    });
    
  } catch (error) {
    console.error('Error initializing Puppeteer:', error);
    
    // Tentar reiniciar se ocorrer um erro
    if (browser) await browser.close();
    setTimeout(initializePuppeteer, 10000);
  }
}

// Verificar se está logado no WhatsApp Web
async function checkIfLoggedIn() {
  try {
    // Checar se a página principal do WhatsApp está carregada
    const mainContent = await page.$('div[data-testid="chat-list"]');
    return !!mainContent;
  } catch (error) {
    return false;
  }
}

// Monitorar e enviar QR code para o Telegram
async function checkQrCode() {
  try {
    if (isLoggedIn) return;
    
    // Buscar elemento do QR code
    const qrCodeCanvas = await page.$('canvas');
    if (!qrCodeCanvas) return;
    
    // Capturar o QR code como imagem
    const qrCodeImageBuffer = await qrCodeCanvas.screenshot();
    const qrCodeBase64 = qrCodeImageBuffer.toString('base64');
    
    // Enviar para o Telegram apenas se for diferente do último
    if (qrCodeBase64 !== lastQrCode) {
      lastQrCode = qrCodeBase64;
      
      // Salvar QR code como arquivo
      const qrCodePath = path.join(__dirname, 'qrcode.png');
      fs.writeFileSync(qrCodePath, qrCodeImageBuffer);
      
      // Enviar para o Telegram
      await sendQrCodeToTelegram(qrCodePath);
    }
  } catch (error) {
    console.error('Error checking QR code:', error);
  }
}

// Enviar QR code para o Telegram
async function sendQrCodeToTelegram(qrCodePath) {
  try {
    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    formData.append('photo', fs.createReadStream(qrCodePath));
    formData.append('caption', 'Escaneie este QR Code para fazer login no WhatsApp Web');
    
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`,
      formData,
      {
        headers: formData.getHeaders()
      }
    );
    
    console.log('QR code sent to Telegram');
  } catch (error) {
    console.error('Error sending QR code to Telegram:', error);
  }
}

// Monitorar mensagens recebidas
async function startMessageMonitoring() {
  try {
    console.log('Starting message monitoring...');
    
    // Usar MutationObserver via página para detectar novas mensagens
    await page.evaluate(() => {
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.addedNodes.length) {
            // Verificar se é uma mensagem não lida
            const unreadMessages = document.querySelectorAll('span[data-testid="icon-unread-count"]');
            if (unreadMessages.length > 0) {
              // Notificar o backend sobre novas mensagens
              window.checkNewMessages = true;
            }
          }
        }
      });
      
      // Observar a lista de chats
      const chatList = document.querySelector('div[data-testid="chat-list"]');
      if (chatList) {
        observer.observe(chatList, { childList: true, subtree: true });
      }
    });
    
    // Verificar periodicamente se há mensagens não lidas
    setInterval(async () => {
      const hasNewMessages = await page.evaluate(() => {
        const result = window.checkNewMessages || false;
        window.checkNewMessages = false;
        return result;
      });
      
      if (hasNewMessages) {
        await checkNewMessages();
      }
    }, 5000);
    
  } catch (error) {
    console.error('Error setting up message monitoring:', error);
  }
}

// Verificar novas mensagens
async function checkNewMessages() {
  try {
    console.log('Checking for new messages...');
    
    // Buscar chats não lidos
    const unreadChats = await page.$$('span[data-testid="icon-unread-count"]');
    
    for (const unreadChat of unreadChats) {
      // Clicar no chat para abrir
      await unreadChat.click();
      await page.waitForTimeout(1000);
      
      // Pegar o número de telefone do contato
      const phoneElement = await page.$('span[data-testid="conversation-info-header-chat-title"]');
      if (!phoneElement) continue;
      
      const phone = await page.evaluate(el => el.textContent, phoneElement);
      
      // Pegar as últimas mensagens
      const messages = await page.$$('div.message-in');
      const lastMessage = messages[messages.length - 1];
      
      if (lastMessage) {
        const messageText = await page.evaluate(el => {
          const textElement = el.querySelector('span.selectable-text');
          return textElement ? textElement.textContent : '';
        }, lastMessage);
        
        // Salvar mensagem no banco de dados
        await db.run(`
          INSERT INTO messages (phone, message, direction, timestamp, status)
          VALUES (?, ?, 'received', datetime('now'), 'unread')
        `, [phone, messageText]);
        
        // Verificar se precisa enviar resposta automática
        const conversation = await db.get(`
          SELECT * FROM conversations WHERE phone = ?
        `, [phone]);
        
        if (conversation && conversation.awaiting_reply) {
          // Enviar resposta automática
          const autoReply = await db.get(`
            SELECT value FROM settings WHERE key = 'auto_reply'
          `);
          
          if (autoReply) {
            await sendMessage(phone, autoReply.value);
            
            // Atualizar status da conversa
            await db.run(`
              UPDATE conversations 
              SET awaiting_reply = 0, 
                  last_interaction = datetime('now'),
                  messages_sent = messages_sent + 1
              WHERE phone = ?
            `, [phone]);
          }
        }
      }
    }
    
  } catch (error) {
    console.error('Error checking new messages:', error);
  }
}

// Gerenciar início de novas conversas
async function startConversationManager() {
  console.log('Starting conversation manager...');
  
  // Verificar a cada 10 minutos se pode iniciar novas conversas
  setInterval(async () => {
    try {
      // Obter membros que ainda não foram contatados
      const members = await db.all(`
        SELECT m.phone, m.name 
        FROM members m
        LEFT JOIN conversations c ON m.phone = c.phone
        WHERE c.phone IS NULL
        LIMIT 1
      `);
      
      if (members.length > 0) {
        const member = members[0];
        
        // Verificar se já iniciou 5 conversas na última hora
        const lastHourConversations = await db.get(`
          SELECT COUNT(*) as count
          FROM conversations
          WHERE last_interaction >= datetime('now', '-1 hour')
        `);
        
        if (lastHourConversations.count < 5) {
          // Obter mensagens de saudação
          const greetingsSetting = await db.get(`
            SELECT value FROM settings WHERE key = 'greeting_messages'
          `);
          
          if (greetingsSetting) {
            const greetings = JSON.parse(greetingsSetting.value);
            const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
            
            // Iniciar conversa
            await startChat(member.phone);
            await sendMessage(member.phone, randomGreeting);
            
            // Registrar conversa
            await db.run(`
              INSERT INTO conversations (phone, status, last_interaction, messages_sent, awaiting_reply)
              VALUES (?, 'active', datetime('now'), 1, 1)
            `, [member.phone]);
            
            console.log(`Started conversation with ${member.phone}`);
          }
        }
      }
    } catch (error) {
      console.error('Error in conversation manager:', error);
    }
  }, 10 * 60 * 1000); // 10 minutos
}

// Iniciar chat com um contato
async function startChat(phone) {
  try {
    // Abrir URL direta do contato
    await page.goto(`https://web.whatsapp.com/send?phone=${phone}`, {
      waitUntil: 'networkidle2'
    });
    
    // Esperar o chat carregar
    await page.waitForSelector('div[data-testid="conversation-panel-wrapper"]', {
      timeout: 30000
    });
    
    return true;
  } catch (error) {
    console.error(`Error starting chat with ${phone}:`, error);
    return false;
  }
}

// Enviar mensagem para um contato
async function sendMessage(phone, message) {
  try {
    // Garantir que o chat está aberto
    const isChatOpen = await page.$('div[data-testid="conversation-panel-wrapper"]');
    if (!isChatOpen) {
      await startChat(phone);
    }
    
    // Clicar no campo de mensagem e digitar
    const inputSelector = 'div[data-testid="conversation-compose-box-input"]';
    await page.waitForSelector(inputSelector, { timeout: 30000 });
    await page.click(inputSelector);
    await page.type(inputSelector, message);
    
    // Clicar no botão de enviar
    await page.click('span[data-testid="send"]');
    await page.waitForTimeout(1000);
    
    // Registrar a mensagem no banco de dados
    await db.run(`
      INSERT INTO messages (phone, message, direction, timestamp, status)
      VALUES (?, ?, 'sent', datetime('now'), 'sent')
    `, [phone, message]);
    
    return true;
  } catch (error) {
    console.error(`Error sending message to ${phone}:`, error);
    return false;
  }
}

// Enviar arquivo para um contato
async function sendFile(phone, filePath, caption = '') {
  try {
    // Garantir que o chat está aberto
    const isChatOpen = await page.$('div[data-testid="conversation-panel-wrapper"]');
    if (!isChatOpen) {
      await startChat(phone);
    }
    
    // Clicar no ícone de anexar
    await page.click('span[data-testid="clip"]');
    await page.waitForTimeout(500);
    
    // Preparar para o diálogo de upload de arquivo
    const [fileChooser] = await Promise.all([
      page.waitForFileChooser(),
      page.click('span[data-testid="attach-document"]')
    ]);
    
    // Selecionar arquivo
    await fileChooser.accept([filePath]);
    
    // Adicionar legenda se fornecida
    if (caption) {
      await page.waitForSelector('div[data-testid="media-caption-input-container"]');
      await page.type('div[data-testid="media-caption-input-container"]', caption);
    }
    
    // Enviar
    await page.click('span[data-testid="send"]');
    await page.waitForTimeout(3000);
    
    // Registrar a mensagem no banco de dados
    await db.run(`
      INSERT INTO messages (phone, message, direction, timestamp, status)
      VALUES (?, ?, 'sent', datetime('now'), 'sent')
    `, [phone, `[Arquivo] ${caption}`]);
    
    return true;
  } catch (error) {
    console.error(`Error sending file to ${phone}:`, error);
    return false;
  }
}

// Obter membros de um grupo
async function getGroupMembers(groupName) {
  try {
    // Buscar o grupo na lista de chats
    const groupElements = await page.$$('span.ggj6brxn[title]');
    let groupFound = false;
    
    for (const element of groupElements) {
      const title = await page.evaluate(el => el.getAttribute('title'), element);
      if (title === groupName) {
        await element.click();
        groupFound = true;
        break;
      }
    }
    
    if (!groupFound) {
      return { success: false, message: 'Grupo não encontrado' };
    }
    
    // Clicar nas informações do grupo
    await page.waitForSelector('span[data-testid="conversation-info-header-chat-title"]');
    await page.click('span[data-testid="conversation-info-header-chat-title"]');
    
    // Extrair membros
    await page.waitForSelector('div[data-testid="contact-list-wrapper"]');
    
    const members = await page.evaluate(() => {
      const memberElements = document.querySelectorAll('div[data-testid="contact-list-wrapper"] span[title]');
      return Array.from(memberElements).map(el => ({
        name: el.getAttribute('title'),
        phone: el.closest('[data-testid="cell-frame-container"]')?.getAttribute('data-testid')?.replace('cell-frame-container-', '') || ''
      }));
    });
    
    // Salvar membros no banco de dados
    for (const member of members) {
      // Pular admins e números de telefone inválidos
      if (!member.phone || member.phone.includes('admin')) continue;
      
      await db.run(`
        INSERT OR IGNORE INTO members (phone, name, group_name)
        VALUES (?, ?, ?)
      `, [member.phone, member.name, groupName]);
    }
    
    return { success: true, members };
  } catch (error) {
    console.error('Error getting group members:', error);
    return { success: false, message: error.message };
  }
}

// Enviar mensagem em massa para todos os membros de um grupo
async function bulkSendToGroup(groupName, message, filePath = null) {
  try {
    // Obter membros do grupo do banco de dados
    const members = await db.all(`
      SELECT phone FROM members WHERE group_name = ?
    `, [groupName]);
    
    if (members.length === 0) {
      return { success: false, message: 'Nenhum membro encontrado para este grupo' };
    }
    
    let successCount = 0;
    
    // Enviar mensagem para cada membro com intervalo
    for (const member of members) {
      if (filePath) {
        await sendFile(member.phone, filePath, message);
      } else {
        await sendMessage(member.phone, message);
      }
      
      successCount++;
      
      // Esperar 10 segundos entre envios
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
    
    return { 
      success: true, 
      message: `Mensagem enviada com sucesso para ${successCount} de ${members.length} membros`
    };
  } catch (error) {
    console.error('Error in bulk sending:', error);
    return { success: false, message: error.message };
  }
}

// Rotas da API
app.get('/api/status', async (req, res) => {
  res.json({
    status: 'online',
    loggedIn: isLoggedIn
  });
});

app.get('/api/groups', async (req, res) => {
  try {
    const groups = await db.all(`
      SELECT DISTINCT group_name FROM members
    `);
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/group/:name/members', async (req, res) => {
  try {
    const { name } = req.params;
    
    // Se o grupo não existe no banco de dados, buscar do WhatsApp
    const existingGroup = await db.get(`
      SELECT COUNT(*) as count FROM members WHERE group_name = ?
    `, [name]);
    
    if (existingGroup.count === 0) {
      const result = await getGroupMembers(name);
      if (!result.success) {
        return res.status(404).json({ error: result.message });
      }
    }
    
    const members = await db.all(`
      SELECT * FROM members WHERE group_name = ?
    `, [name]);
    
    res.json(members);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/refresh-group/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const result = await getGroupMembers(name);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/send-message', async (req, res) => {
  try {
    const { phone, message } = req.body;
    
    if (!phone || !message) {
      return res.status(400).json({ error: 'Telefone e mensagem são obrigatórios' });
    }
    
    const result = await sendMessage(phone, message);
    res.json({ success: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/send-file', async (req, res) => {
  try {
    const { phone, filePath, caption } = req.body;
    
    if (!phone || !filePath) {
      return res.status(400).json({ error: 'Telefone e caminho do arquivo são obrigatórios' });
    }
    
    const result = await sendFile(phone, filePath, caption || '');
    res.json({ success: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/bulk-send', async (req, res) => {
  try {
    const { groupName, message, filePath } = req.body;
    
    if (!groupName || !message) {
      return res.status(400).json({ error: 'Nome do grupo e mensagem são obrigatórios' });
    }
    
    const result = await bulkSendToGroup(groupName, message, filePath);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/messages/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const messages = await db.all(`
      SELECT * FROM messages WHERE phone = ? ORDER BY timestamp
    `, [phone]);
    
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/settings', async (req, res) => {
  try {
    const settings = await db.all(`SELECT * FROM settings`);
    
    // Converter para formato mais amigável
    const formattedSettings = {};
    for (const setting of settings) {
      try {
        formattedSettings[setting.key] = JSON.parse(setting.value);
      } catch (e) {
        formattedSettings[setting.key] = setting.value;
      }
    }
    
    res.json(formattedSettings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const { key, value } = req.body;
    
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'Chave e valor são obrigatórios' });
    }
    
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;
    
    await db.run(`
      INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
    `, [key, stringValue]);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Inicializar servidor
async function startServer() {
  try {
    await initializeDatabase();
    await initializePuppeteer();
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

// Fechamento gracioso
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  
  clearInterval(qrCheckInterval);
  
  if (browser) {
    await browser.close();
  }
  
  if (db) {
    await db.close();
  }
  
  process.exit(0);
});

// Iniciar servidor
startServer();