const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ytdl = require('ytdl-core');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);

// Configuração do aplicativo
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// Configuração para processar JSON e dados de formulário
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuração do Multer para upload de arquivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './'); // Salvar na raiz, conforme exigido
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'ad-' + uniqueSuffix + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // Limite de 10MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|mp4/;
        const ext = path.extname(file.originalname).toLowerCase();
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && allowedTypes.test(ext)) {
            return cb(null, true);
        }
        
        cb(new Error('Apenas arquivos de imagem (JPEG, PNG, GIF) ou vídeo (MP4) são permitidos!'));
    }
});

// Banco de dados SQLite
let db;

async function initializeDatabase() {
    db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    // Tabela de usuários admin
    await db.exec(`
        CREATE TABLE IF NOT EXISTS admin_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Verificar se já existe um usuário admin e criar um padrão se não houver
    const adminCount = await db.get('SELECT COUNT(*) as count FROM admin_users');
    if (adminCount.count === 0) {
        const defaultPassword = crypto.createHash('sha256').update('admin123').digest('hex');
        await db.run('INSERT INTO admin_users (username, password) VALUES (?, ?)', ['admin', defaultPassword]);
    }

    // Tabela de anúncios
    await db.exec(`
        CREATE TABLE IF NOT EXISTS ads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            content TEXT NOT NULL,
            link TEXT,
            page TEXT NOT NULL,
            position TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabela de estatísticas de anúncios
    await db.exec(`
        CREATE TABLE IF NOT EXISTS ad_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ad_id INTEGER NOT NULL,
            view_count INTEGER DEFAULT 0,
            click_count INTEGER DEFAULT 0,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ad_id) REFERENCES ads (id) ON DELETE CASCADE
        )
    `);

    // Tabela de buscas
    await db.exec(`
        CREATE TABLE IF NOT EXISTS searches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            term TEXT NOT NULL,
            count INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_searched TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabela de downloads
    await db.exec(`
        CREATE TABLE IF NOT EXISTS downloads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            video_id TEXT NOT NULL,
            format TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabela de atividades (para o dashboard)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS activities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            details TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log('Banco de dados inicializado com sucesso!');
}

// Middleware de autenticação para rotas admin
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Token não fornecido' });
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Token inválido' });
    }
};

// Servir arquivos estáticos da raiz
app.use(express.static('./'));

// Rotas da API

// Busca no YouTube
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    
    if (!query) {
        return res.status(400).json({ error: 'Parâmetro de busca não fornecido' });
    }
    
    try {
        // Registrar ou atualizar o termo de busca no banco de dados
        const existingSearch = await db.get('SELECT * FROM searches WHERE term = ?', [query]);
        
        if (existingSearch) {
            await db.run('UPDATE searches SET count = count + 1, last_searched = CURRENT_TIMESTAMP WHERE id = ?', [existingSearch.id]);
        } else {
            await db.run('INSERT INTO searches (term) VALUES (?)', [query]);
        }
        
        // Registrar atividade
        await db.run('INSERT INTO activities (type, details) VALUES (?, ?)', 
            ['search', `Busca por: ${query}`]);
        
        // Esta é uma simulação de resultados para não depender da API real do YouTube
        // Em um cenário real, você usaria a API oficial do YouTube ou ytsr (YouTube Search)
        const mockResults = [
            {
                videoId: 'dQw4w9WgXcQ',
                title: `Resultado para "${query}" - Música Popular 1`,
                thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg'
            },
            {
                videoId: 'hT_nvWreIhg',
                title: `Resultado para "${query}" - Música Popular 2`,
                thumbnail: 'https://i.ytimg.com/vi/hT_nvWreIhg/mqdefault.jpg'
            },
            {
                videoId: 'JGwWNGJdvx8',
                title: `Resultado para "${query}" - Música Popular 3`,
                thumbnail: 'https://i.ytimg.com/vi/JGwWNGJdvx8/mqdefault.jpg'
            },
            {
                videoId: 'RgKAFK5djSk',
                title: `Resultado para "${query}" - Vídeo Popular 1`,
                thumbnail: 'https://i.ytimg.com/vi/RgKAFK5djSk/mqdefault.jpg'
            },
            {
                videoId: 'kJQP7kiw5Fk',
                title: `Resultado para "${query}" - Vídeo Popular 2`,
                thumbnail: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/mqdefault.jpg'
            },
            {
                videoId: 'YqeW9_5kURI',
                title: `Resultado para "${query}" - Música Recente 1`,
                thumbnail: 'https://i.ytimg.com/vi/YqeW9_5kURI/mqdefault.jpg'
            }
        ];
        
        res.json(mockResults);
        
    } catch (error) {
        console.error('Erro na busca:', error);
        res.status(500).json({ error: 'Erro ao processar a busca' });
    }
});

// Download de vídeo/áudio
app.get('/api/download', async (req, res) => {
    const { id, format } = req.query;
    
    if (!id || !format || (format !== 'mp3' && format !== 'mp4')) {
        return res.status(400).json({ error: 'Parâmetros inválidos' });
    }
    
    try {
        // Registrar o download
        await db.run('INSERT INTO downloads (video_id, format) VALUES (?, ?)', [id, format]);
        
        // Registrar atividade
        await db.run('INSERT INTO activities (type, details) VALUES (?, ?)', 
            ['download', `Download de ${id} em formato ${format}`]);
        
        // Em um ambiente real, você utilizaria o ytdl-core para processar o download
        // Aqui, vamos simular o processo retornando um arquivo mock
        
        if (format === 'mp3') {
            res.setHeader('Content-Disposition', `attachment; filename="${id}.mp3"`);
            res.setHeader('Content-Type', 'audio/mpeg');
            
            // Simular um arquivo MP3
            // No ambiente real, você utilizaria ytdl-core.downloadFromInfo()
            const mockAudioBuffer = Buffer.alloc(1024 * 1024); // 1MB buffer
            mockAudioBuffer.fill(0);
            res.send(mockAudioBuffer);
        } else { // mp4
            res.setHeader('Content-Disposition', `attachment; filename="${id}.mp4"`);
            res.setHeader('Content-Type', 'video/mp4');
            
            // Simular um arquivo MP4
            const mockVideoBuffer = Buffer.alloc(2 * 1024 * 1024); // 2MB buffer
            mockVideoBuffer.fill(0);
            res.send(mockVideoBuffer);
        }
    } catch (error) {
        console.error('Erro no download:', error);
        res.status(500).json({ error: 'Erro ao processar o download' });
    }
});

// Rotas para anúncios
app.get('/api/ads/random', async (req, res) => {
    const page = req.query.page || 'home';
    
    try {
        // Buscar um anúncio aleatório ativo para a página especificada
        const ad = await db.get('SELECT * FROM ads WHERE page = ? AND status = "active" ORDER BY RANDOM() LIMIT 1', [page]);
        
        if (!ad) {
            return res.json(null);
        }
        
        res.json(ad);
    } catch (error) {
        console.error('Erro ao buscar anúncio:', error);
        res.status(500).json({ error: 'Erro ao buscar anúncio' });
    }
});

// Registrar visualização de anúncio
app.post('/api/stats/ad-view', async (req, res) => {
    const { adId } = req.body;
    
    if (!adId) {
        return res.status(400).json({ error: 'ID do anúncio não fornecido' });
    }
    
    try {
        // Verificar se já existe estatística para este anúncio
        const stat = await db.get('SELECT * FROM ad_stats WHERE ad_id = ?', [adId]);
        
        if (stat) {
            await db.run('UPDATE ad_stats SET view_count = view_count + 1, last_updated = CURRENT_TIMESTAMP WHERE ad_id = ?', [adId]);
        } else {
            await db.run('INSERT INTO ad_stats (ad_id, view_count) VALUES (?, 1)', [adId]);
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao registrar visualização:', error);
        res.status(500).json({ error: 'Erro ao registrar visualização' });
    }
});

// Registrar clique em anúncio
app.post('/api/stats/ad-click', async (req, res) => {
    const { adId } = req.body;
    
    if (!adId) {
        return res.status(400).json({ error: 'ID do anúncio não fornecido' });
    }
    
    try {
        // Verificar se já existe estatística para este anúncio
        const stat = await db.get('SELECT * FROM ad_stats WHERE ad_id = ?', [adId]);
        
        if (stat) {
            await db.run('UPDATE ad_stats SET click_count = click_count + 1, last_updated = CURRENT_TIMESTAMP WHERE ad_id = ?', [adId]);
        } else {
            await db.run('INSERT INTO ad_stats (ad_id, click_count) VALUES (?, 1)', [adId]);
        }
        
        // Registrar atividade
        await db.run('INSERT INTO activities (type, details) VALUES (?, ?)', 
            ['ad_click', `Clique no anúncio ID ${adId}`]);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao registrar clique:', error);
        res.status(500).json({ error: 'Erro ao registrar clique' });
    }
});

// Registrar clique em botão de download
app.post('/api/stats/download-click', async (req, res) => {
    const { videoId, format } = req.body;
    
    if (!videoId || !format) {
        return res.status(400).json({ error: 'Informações incompletas' });
    }
    
    try {
        // Registrar atividade
        await db.run('INSERT INTO activities (type, details) VALUES (?, ?)', 
            ['download_click', `Clique para download de ${videoId} em formato ${format}`]);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao registrar clique em download:', error);
        res.status(500).json({ error: 'Erro ao registrar estatística' });
    }
});

// Rotas de administração

// Login
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios' });
    }
    
    try {
        const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
        const user = await db.get('SELECT * FROM admin_users WHERE username = ? AND password = ?', [username, hashedPassword]);
        
        if (!user) {
            return res.status(401).json({ success: false, message: 'Credenciais inválidas' });
        }
        
        // Gerar token JWT
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        
        res.json({ success: true, token });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ success: false, message: 'Erro no servidor' });
    }
});

// Verificar token
app.get('/api/admin/verify', authenticate, (req, res) => {
    res.json({ success: true, user: req.user });
});

// Dashboard
app.get('/api/admin/dashboard', authenticate, async (req, res) => {
    try {
        // Total de anúncios
        const totalAds = await db.get('SELECT COUNT(*) as count FROM ads');
        
        // Visualizações hoje
        const todayViews = await db.get(`
            SELECT SUM(view_count) as count FROM ad_stats 
            WHERE date(last_updated) = date('now')
        `);
        
        // Cliques hoje
        const todayClicks = await db.get(`
            SELECT SUM(click_count) as count FROM ad_stats 
            WHERE date(last_updated) = date('now')
        `);
        
        // Downloads hoje
        const todayDownloads = await db.get(`
            SELECT COUNT(*) as count FROM downloads 
            WHERE date(timestamp) = date('now')
        `);
        
        // Atividade recente
        const recentActivity = await db.all(`
            SELECT * FROM activities 
            ORDER BY timestamp DESC 
            LIMIT 10
        `);
        
        res.json({
            totalAds: totalAds.count || 0,
            todayViews: todayViews.count || 0,
            todayClicks: todayClicks.count || 0,
            todayDownloads: todayDownloads.count || 0,
            recentActivity
        });
    } catch (error) {
        console.error('Erro ao buscar dados do dashboard:', error);
        res.status(500).json({ error: 'Erro ao buscar dados do dashboard' });
    }
});

// Listar anúncios
app.get('/api/admin/ads', authenticate, async (req, res) => {
    const typeFilter = req.query.type || 'all';
    const pageFilter = req.query.page || 'all';
    
    try {
        let query = 'SELECT ads.*, COALESCE(ad_stats.view_count, 0) as views, COALESCE(ad_stats.click_count, 0) as clicks FROM ads LEFT JOIN ad_stats ON ads.id = ad_stats.ad_id';
        const params = [];
        
        if (typeFilter !== 'all' || pageFilter !== 'all') {
            query += ' WHERE';
            
            if (typeFilter !== 'all') {
                query += ' ads.type = ?';
                params.push(typeFilter);
            }
            
            if (typeFilter !== 'all' && pageFilter !== 'all') {
                query += ' AND';
            }
            
            if (pageFilter !== 'all') {
                query += ' ads.page = ?';
                params.push(pageFilter);
            }
        }
        
        query += ' ORDER BY ads.id DESC';
        
        const ads = await db.all(query, params);
        res.json(ads);
    } catch (error) {
        console.error('Erro ao listar anúncios:', error);
        res.status(500).json({ error: 'Erro ao listar anúncios' });
    }
});

// Adicionar anúncio
app.post('/api/admin/ads', authenticate, upload.single('file'), async (req, res) => {
    try {
        const { type, page, position, status, link } = req.body;
        
        if (!type || !page || !position) {
            return res.status(400).json({ success: false, message: 'Informações incompletas' });
        }
        
        let content = '';
        
        if (type === 'iframe') {
            content = req.body.content;
            if (!content) {
                return res.status(400).json({ success: false, message: 'Código iframe não fornecido' });
            }
        } else {
            // Para outros tipos, deve haver um arquivo
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'Arquivo não fornecido' });
            }
            content = req.file.filename;
        }
        
        // Inserir anúncio no banco de dados
        const result = await db.run(
            'INSERT INTO ads (type, content, link, page, position, status) VALUES (?, ?, ?, ?, ?, ?)',
            [type, content, link || null, page, position, status || 'active']
        );
        
        // Criar entrada para estatísticas
        await db.run('INSERT INTO ad_stats (ad_id) VALUES (?)', [result.lastID]);
        
        // Registrar atividade
        await db.run('INSERT INTO activities (type, details) VALUES (?, ?)', 
            ['ad_create', `Novo anúncio criado do tipo ${type} para a página ${page}`]);
        
        res.json({ success: true, id: result.lastID });
    } catch (error) {
        console.error('Erro ao adicionar anúncio:', error);
        res.status(500).json({ success: false, message: 'Erro ao adicionar anúncio' });
    }
});

// Alterar status do anúncio
app.patch('/api/admin/ads/:id/status', authenticate, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status || (status !== 'active' && status !== 'inactive')) {
        return res.status(400).json({ success: false, message: 'Status inválido' });
    }
    
    try {
        await db.run('UPDATE ads SET status = ? WHERE id = ?', [status, id]);
        
        // Registrar atividade
        await db.run('INSERT INTO activities (type, details) VALUES (?, ?)', 
            ['ad_status', `Anúncio ID ${id} alterado para ${status}`]);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao alterar status:', error);
        res.status(500).json({ success: false, message: 'Erro ao alterar status' });
    }
});

// Excluir anúncio
app.delete('/api/admin/ads/:id', authenticate, async (req, res) => {
    const { id } = req.params;
    
    try {
        // Primeiro, verificar se o anúncio existe e obter seu conteúdo
        const ad = await db.get('SELECT * FROM ads WHERE id = ?', [id]);
        
        if (!ad) {
            return res.status(404).json({ success: false, message: 'Anúncio não encontrado' });
        }
        
        // Excluir o anúncio do banco de dados
        await db.run('DELETE FROM ads WHERE id = ?', [id]);
        
        // Se for um arquivo (não iframe), excluir o arquivo
        if (ad.type !== 'iframe' && fs.existsSync(ad.content)) {
            await unlinkAsync(ad.content);
        }
        
        // Registrar atividade
        await db.run('INSERT INTO activities (type, details) VALUES (?, ?)', 
            ['ad_delete', `Anúncio ID ${id} excluído`]);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao excluir anúncio:', error);
        res.status(500).json({ success: false, message: 'Erro ao excluir anúncio' });
    }
});

// Estatísticas
app.get('/api/admin/statistics', authenticate, async (req, res) => {
    const period = req.query.period || 'all';
    
    try {
        let dateFilter = '';
        
        // Configurar filtro de data com base no período
        if (period === 'today') {
            dateFilter = "WHERE date(last_updated) = date('now')";
        } else if (period === 'week') {
            dateFilter = "WHERE date(last_updated) >= date('now', '-7 days')";
        } else if (period === 'month') {
            dateFilter = "WHERE date(last_updated) >= date('now', '-30 days')";
        }
        
        // Top anúncios por CTR
        const topAds = await db.all(`
            SELECT ads.id, ads.type, ads.content, ad_stats.view_count as views, ad_stats.click_count as clicks
            FROM ads 
            JOIN ad_stats ON ads.id = ad_stats.ad_id
            ${dateFilter}
            ORDER BY (CAST(ad_stats.click_count AS REAL) / CASE WHEN ad_stats.view_count = 0 THEN 1 ELSE ad_stats.view_count END) DESC, ad_stats.view_count DESC
            LIMIT 5
        `);
        
        // Top buscas
        const topSearches = await db.all(`
            SELECT searches.term, searches.count,
                (SELECT COUNT(*) FROM downloads WHERE date(downloads.timestamp) >= date(searches.last_searched, '-30 days')) as downloads
            FROM searches
            ORDER BY searches.count DESC
            LIMIT 10
        `);
        
        res.json({
            topAds,
            topSearches
        });
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        res.status(500).json({ error: 'Erro ao buscar estatísticas' });
    }
});

// Inicializar banco de dados e iniciar servidor
async function startServer() {
    try {
        await initializeDatabase();
        
        app.listen(PORT, () => {
            console.log(`Servidor rodando na porta ${PORT}`);
        });
    } catch (error) {
        console.error('Erro ao inicializar o servidor:', error);
        process.exit(1);
    }
}

startServer();