const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Garantir que o diretório db exista
const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir);
}

// Conectando ao banco de dados
const dbPath = path.join(dbDir, 'acmines.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados:', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite');
    initDb();
  }
});

// Inicialização do banco de dados
function initDb() {
  db.serialize(() => {
    // Tabela de chaves
    db.run(`CREATE TABLE IF NOT EXISTS keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE,
      createdAt TEXT
    )`);

    // Tabela de usuários
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE,
      FOREIGN KEY(key) REFERENCES keys(key)
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
  });
}

// Funções para interagir com o banco de dados
async function generateKey(plan) {
  return new Promise((resolve, reject) => {
    const { v4: uuidv4 } = require('uuid');
    const key = uuidv4();
    const createdAt = new Date().toISOString();

    db.run(
      'INSERT INTO keys (key, createdAt) VALUES (?, ?)',
      [key, createdAt],
      function (err) {
        if (err) {
          return reject(err);
        }
        
        // Cria um usuário associado à chave
        db.run(
          'INSERT INTO users (key) VALUES (?)',
          [key],
          function (err) {
            if (err) {
              return reject(err);
            }
            
            // Calcular data de expiração baseada no plano
            let expiresAt = new Date();
            switch (plan) {
              case '7d':
                expiresAt.setDate(expiresAt.getDate() + 7);
                break;
              case '15d':
                expiresAt.setDate(expiresAt.getDate() + 15);
                break;
              case '30d':
                expiresAt.setDate(expiresAt.getDate() + 30);
                break;
              default:
                expiresAt.setDate(expiresAt.getDate() + 7); // Padrão: 7 dias
            }
            
            // Insere a assinatura
            db.run(
              'INSERT INTO subscriptions (userId, plan, createdAt, expiresAt, status) VALUES (?, ?, ?, ?, ?)',
              [this.lastID, plan, createdAt, expiresAt.toISOString(), 'active'],
              function (err) {
                if (err) {
                  return reject(err);
                }
                resolve({ key, createdAt, plan });
              }
            );
          }
        );
      }
    );
  });
}

async function getAllKeys() {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT k.id, k.key, k.createdAt, s.plan, s.expiresAt
      FROM keys k
      JOIN users u ON k.key = u.key
      JOIN subscriptions s ON u.id = s.userId
      ORDER BY k.createdAt DESC
    `;
    
    db.all(query, [], (err, rows) => {
      if (err) {
        return reject(err);
      }
      resolve(rows);
    });
  });
}

async function verifyKey(key) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT u.id as userId, s.plan, s.createdAt, s.expiresAt, s.status
      FROM users u
      JOIN subscriptions s ON u.id = s.userId
      WHERE u.key = ?
    `;
    
    db.get(query, [key], (err, row) => {
      if (err) {
        return reject(err);
      }
      
      if (!row) {
        return resolve({ valid: false });
      }
      
      // Verificar se a assinatura expirou
      const now = new Date();
      const expiresAt = new Date(row.expiresAt);
      const isExpired = now > expiresAt || row.status !== 'active';
      
      resolve({
        valid: !isExpired,
        userId: row.userId,
        plan: row.plan,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        status: isExpired ? 'expired' : row.status,
        remainingDays: isExpired ? 0 : Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24))
      });
    });
  });
}

module.exports = {
  db,
  generateKey,
  getAllKeys,
  verifyKey
};
