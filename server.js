require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
// const ytdl = require('ytdl-core'); // Removido - não será mais usado
const { spawn } = require('child_process'); // Adicionado para yt-dlp
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, ''))); // Serve static files from root

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// Mongoose Schemas
const AdSchema = new mongoose.Schema({
    title: { type: String, required: true },
    type: { type: String, enum: ['image', 'video', 'gif', 'iframe'], required: true },
    url: { type: String, required: true }, // URL for image/video/gif, or embed code for iframe
    position: { type: String, enum: ['footer', 'modal', 'body_top', 'body_bottom'], required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdAt: { type: Date, default: Date.now }
});
const Ad = mongoose.model('Ad', AdSchema);

const StatSchema = new mongoose.Schema({
    adId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ad', required: true },
    type: { type: String, enum: ['view', 'click'], required: true },
    timestamp: { type: Date, default: Date.now }
});
const Stat = mongoose.model('Stat', StatSchema);

const VideoLogSchema = new mongoose.Schema({
    youtubeId: { type: String, required: true },
    title: { type: String, required: true },
    format: { type: String, enum: ['mp3', 'mp4'], required: true },
    requestedAt: { type: Date, default: Date.now }
});
const VideoLog = mongoose.model('VideoLog', VideoLogSchema);


// --- API Routes ---

// Youtube
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    try {
        const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: {
                part: 'snippet',
                q: query,
                key: YOUTUBE_API_KEY,
                maxResults: 10, // Or configurable
                type: 'video'
            }
        });
        res.json(response.data.items);
    } catch (error) {
        console.error('YouTube API Search Error:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to fetch videos from YouTube', details: error.message });
    }
});

// Get popular/suggested videos (example: music chart or hardcoded)
app.get('/api/popular', async (req, res) => {
    try {
        const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: {
                part: 'snippet',
                q: 'música popular moçambique 2025', // Example query, updated year
                key: YOUTUBE_API_KEY,
                maxResults: 5,
                type: 'video',
                videoCategoryId: '10' // Music category
            }
        });
        res.json(response.data.items);
    } catch (error) {
        console.error('YouTube API Popular Error:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to fetch popular videos', details: error.message });
    }
});


// Generate Download Link using yt-dlp
app.get('/api/download', async (req, res) => {
    const videoId = req.query.videoId;
    const format = req.query.format; // 'mp3' or 'mp4'

    if (!videoId) {
        return res.status(400).json({ error: 'videoId is required' });
    }
    if (!format || (format !== 'mp3' && format !== 'mp4')) {
        return res.status(400).json({ error: 'format (mp3 or mp4) is required' });
    }

    // Use standard YouTube URL for yt-dlp
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    try {
        const getYtDlpPath = () => {
            return process.env.YT_DLP_PATH || 'yt-dlp';
        };
        
        const ytDlpPath = getYtDlpPath();
        let videoTitle = videoId; // Fallback title

        // Etapa 1: Obter informações do vídeo (título)
        const infoArgs = ['--get-title', '-o', '%(title)s', videoUrl];
        const infoProcess = spawn(ytDlpPath, infoArgs);
        
        let titleData = '';
        let titleErrorData = '';

        infoProcess.stdout.on('data', (data) => {
            titleData += data.toString();
        });
        infoProcess.stderr.on('data', (data) => {
            titleErrorData += data.toString();
        });

        const titleExitCode = await new Promise((resolve) => {
            infoProcess.on('close', resolve);
        });

        if (titleExitCode === 0 && titleData.trim() !== '') {
            videoTitle = titleData.trim().replace(/[^\x00-\x7F]/g, "").replace(/[\\/:*?"<>|]/g, '_'); // Sanitize title for filename
        } else {
            console.warn(`yt-dlp (get-title) for ${videoId} failed or returned empty. Stderr: ${titleErrorData}`);
            // Usaremos o videoId como fallback para o nome do arquivo se o título não puder ser obtido
        }

        // Log da solicitação de download
        const newLog = new VideoLog({ youtubeId: videoId, title: videoTitle, format });
        await newLog.save();

        let ytDlpDownloadArgs = [];
        let contentType = '';
        let filename = '';

        if (format === 'mp3') {
            ytDlpDownloadArgs = [
                '-f', 'bestaudio[ext=m4a]/bestaudio',
                '--extract-audio',
                '--audio-format', 'mp3',
                '--audio-quality', '0', // 0 for VBR best, or 128K, 192K, etc.
                videoUrl,
                '-o', '-' // Output to stdout
            ];
            contentType = 'audio/mpeg';
            filename = `${videoTitle}.mp3`;
        } else { // mp4
            ytDlpDownloadArgs = [
                // Tenta obter vídeo mp4 e áudio m4a, depois melhor mp4 geral, depois melhor geral.
                // Adicionado --embed-thumbnail para incluir a miniatura no MP4 se possível
                '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                '--embed-thumbnail', // Tenta embutir a thumbnail no vídeo
                videoUrl,
                '-o', '-' // Output to stdout
            ];
            contentType = 'video/mp4';
            filename = `${videoTitle}.mp4`;
        }
        
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`); // Encode filename
        res.setHeader('Content-Type', contentType);
        
        console.log(`Attempting download for ${videoId} as ${format} with filename: ${filename}`);
        console.log(`Executing: ${ytDlpPath} ${ytDlpDownloadArgs.join(' ')}`);

        const ytDlpDownloadProcess = spawn(ytDlpPath, ytDlpDownloadArgs);

        ytDlpDownloadProcess.stdout.pipe(res);

        ytDlpDownloadProcess.stderr.on('data', (data) => {
            console.error(`yt-dlp stderr (${videoId} ${format}): ${data}`);
        });

        ytDlpDownloadProcess.on('error', (error) => {
            console.error(`Failed to start yt-dlp download process for ${videoId} ${format}.`, error);
            if (!res.headersSent) {
                 res.status(500).json({ error: 'Failed to start download process', details: error.message });
            } else if (res.writableEnded === false) {
                res.end(); // Tenta finalizar a resposta se um erro ocorrer após o início do stream
            }
        });
        
        ytDlpDownloadProcess.on('close', (code) => {
            console.log(`yt-dlp download process for ${videoId} ${format} exited with code ${code}`);
            if (code !== 0) {
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Download process failed', details: `yt-dlp exited with code ${code}` });
                } else if (res.writableEnded === false) {
                    console.error(`yt-dlp exited with code ${code} after headers sent. Stream might be incomplete.`);
                    res.end(); // Garante que a resposta seja finalizada
                }
            } else {
                 if (res.writableEnded === false) {
                    res.end(); // Garante que a resposta seja finalizada em caso de sucesso também
                }
            }
        });

    } catch (error) {
        console.error(`Error in /api/download for ${videoId} ${format}:`, error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to process video for download', details: error.message });
        }
    }
});


// --- Ad Management API ---
// Create Ad
app.post('/api/ads', async (req, res) => {
    try {
        const newAd = new Ad(req.body);
        await newAd.save();
        res.status(201).json(newAd);
    } catch (error) {
        res.status(400).json({ error: 'Failed to create ad', details: error.message });
    }
});

// Get All Ads (for admin)
app.get('/api/ads', async (req, res) => {
    try {
        const ads = await Ad.find();
        res.json(ads);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch ads', details: error.message });
    }
});

// Get Active Ads for Display (for public site)
app.get('/api/ads/serve', async (req, res) => {
    try {
        const position = req.query.position;
        let query = { status: 'active' };
        if (position) {
            query.position = position;
        }
        const ads = await Ad.find(query);
        if (ads.length > 0 && position) {
            const randomAd = ads[Math.floor(Math.random() * ads.length)];
            return res.json(randomAd);
        }
        res.json(ads); 
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch active ads', details: error.message });
    }
});


// Update Ad
app.put('/api/ads/:id', async (req, res) => {
    try {
        const updatedAd = await Ad.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedAd) return res.status(404).json({ error: 'Ad not found' });
        res.json(updatedAd);
    } catch (error) {
        res.status(400).json({ error: 'Failed to update ad', details: error.message });
    }
});

// Delete Ad
app.delete('/api/ads/:id', async (req, res) => {
    try {
        const deletedAd = await Ad.findByIdAndDelete(req.params.id);
        if (!deletedAd) return res.status(404).json({ error: 'Ad not found' });
        await Stat.deleteMany({ adId: req.params.id });
        res.json({ message: 'Ad deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete ad', details: error.message });
    }
});

// --- Statistics API ---
// Record Ad Event (View or Click)
app.post('/api/stats/record', async (req, res) => {
    const { adId, type } = req.body; 
    if (!adId || !type) {
        return res.status(400).json({ error: 'adId and type (view/click) are required' });
    }
    try {
        const adExists = await Ad.findById(adId);
        if (!adExists) return res.status(404).json({ error: 'Ad not found for this stat' });

        const newStat = new Stat({ adId, type });
        await newStat.save();
        res.status(201).json(newStat);
    } catch (error) {
        res.status(400).json({ error: 'Failed to record stat', details: error.message });
    }
});

// Get Stats (for admin)
app.get('/api/stats', async (req, res) => {
    try {
        const allStats = await Stat.find().populate('adId', 'title'); 
        
        const adStats = {};
        for (const stat of allStats) {
            if (!stat.adId) continue; 
            const adIdStr = stat.adId._id.toString();
            if (!adStats[adIdStr]) {
                const adDetails = await Ad.findById(adIdStr).select('status title').lean(); // Use lean for plain object
                adStats[adIdStr] = {
                    adTitle: stat.adId.title, // from populate
                    adStatus: adDetails ? adDetails.status : 'deleted',
                    views: 0,
                    clicks: 0,
                    ctr: 0
                };
            }
            if (stat.type === 'view') adStats[adIdStr].views++;
            if (stat.type === 'click') adStats[adIdStr].clicks++;
        }

        for (const adIdStr in adStats) {
            if (adStats[adIdStr].views > 0) {
                adStats[adIdStr].ctr = parseFloat(((adStats[adIdStr].clicks / adStats[adIdStr].views) * 100).toFixed(2));
            }
        }
        res.json(Object.values(adStats));
    } catch (error) {
        console.error("Error fetching stats:", error);
        res.status(500).json({ error: 'Failed to fetch stats', details: error.message });
    }
});

// Serve frontend files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/download.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'download.html'));
});
app.get('/admin.html', (req, res) => { 
    res.sendFile(path.join(__dirname, 'admin.html'));
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
