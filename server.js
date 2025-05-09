const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const port = process.env.PORT || 3000;

// Configurar o Express para servir o index.html diretamente
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Rota para login e captura de dados do Aviator
app.get('/get-signals', async (req, res) => {
    const browser = await puppeteer.launch({
        headless: true,  // Mude para false se quiser ver o navegador
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    try {
        // Acesse o site da Olabet
        await page.goto('https://www.olabet.co.mz/', { waitUntil: 'domcontentloaded' });

        // Espera o botão de login aparecer e clica nele
        await page.waitForSelector('.btosystem-showlogin-btn');
        await page.click('.btosystem-showlogin-btn');
        
        // Espera o formulário de login e preenche
        await page.waitForSelector('#modal-login-simple-mobile-btn');
        await page.type('#username-modal-login-simple-mobile', '865097696');
        await page.type('#password-modal-login-simple-mobile', '123456');
        await page.click('#modal-login-simple-mobile-btn');
        
        // Aguarda o redirecionamento para a página do Aviator
        await page.waitForNavigation();
        await page.goto('https://www.olabet.co.mz/aviator/', { waitUntil: 'domcontentloaded' });

        // Espera a seção das velas ser carregada
        await page.waitForSelector('app-stats-widget');
        
        // Captura os dados das velas
        const velas = await page.$$eval(
            'body > app-root > app-game > div > div.main-container > div.w-100.h-100 > div > div.game-play > div.result-history.disabled-on-game-focused > app-stats-widget > div > div.payouts-wrapper > div > div',
            elements => {
                return elements.map((el, index) => {
                    const multiplicador = el.textContent.trim();
                    return { index: index + 1, multiplicador };
                });
            }
        );

        // Envia os dados para o front-end
        res.json({ signals: velas });

    } catch (error) {
        res.status(500).send('Erro ao capturar dados: ' + error.message);
    } finally {
        await browser.close();
    }
});

// Inicia o servidor
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});