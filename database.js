const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Conectar ao banco de dados SQLite
const db = new sqlite3.Database('database.sqlite');

// Inicializar o banco de dados
function initDatabase() {
  db.serialize(() => {
    // Criar tabela de chaves de acesso
    db.run(`
      CREATE TABLE IF NOT EXISTS access_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        type INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )
    `);
    
    // Criar tabela para histórico de rosas
    db.run(`
      CREATE TABLE IF NOT EXISTS roses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        passed INTEGER DEFAULT 0
      )
    `);
    
    console.log('Banco de dados inicializado com sucesso!');
  });
}

// Criar nova chave de acesso
function createKey(code, type, createdAt, expiresAt, callback) {
  const query = `
    INSERT INTO access_keys (code, type, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `;
  
  db.run(query, [code, type, createdAt, expiresAt], function(err) {
    callback(err);
  });
}

// Obter chave pelo código
function getKey(code, callback) {
  const query = `
    SELECT * FROM access_keys
    WHERE code = ?
  `;
  
  db.get(query, [code], (err, row) => {
    if (err) {
      return callback(err);
    }
    
    if (!row) {
      return callback(null, null);
    }
    
    const key = {
      id: row.id,
      code: row.code,
      type: row.type,
      createdAt: row.created_at,
      expiresAt: row.expires_at
    };
    
    callback(null, key);
  });
}

// Salvar uma nova rosa gerada
function saveRose(timestamp, callback) {
  const query = `
    INSERT INTO roses (timestamp, passed)
    VALUES (?, 0)
  `;
  
  db.run(query, [timestamp], function(err) {
    callback(err, this.lastID);
  });
}

// Marcar rosa como passada
function markRoseAsPassed(roseId, callback) {
  const query = `
    UPDATE roses
    SET passed = 1
    WHERE id = ?
  `;
  
  db.run(query, [roseId], function(err) {
    callback(err);
  });
}

// Obter histórico de rosas
function getRoses(callback) {
  const query = `
    SELECT * FROM roses
    ORDER BY timestamp DESC
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      return callback(err);
    }
    
    const roses = rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      passed: row.passed === 1
    }));
    
    callback(null, roses);
  });
}

module.exports = {
  initDatabase,
  createKey,
  getKey,
  saveRose,
  markRoseAsPassed,
  getRoses
};
