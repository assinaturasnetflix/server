const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(__dirname)); // serve index.html no mesmo diretório

let ultimasVelas = [];

(async () => {
  console.log("[INFO] Iniciando navegador...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  try {
    console.log("[INFO] Acessando site da Olabet...");
    await page.goto('https://www.olabet.co.mz/', { waitUntil: 'networkidle2' });

    console.log("[INFO] Preenchendo campos de login...");
    await page.click('#modal-login-simple-mobile-btn', { delay: 500 }).catch(() => {});
    await page.type('#username-modal-login-simple-mobile', '865097696');
    await page.type('#btoLoginForm53a4006bb0b6a59fc43b286074cca9cd > div:nth-child(3) > input', '123456');

    console.log("[INFO] Enviando login...");
    await Promise.all([
      page.click('#modal-login-simple-mobile-btn'),
      page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    console.log("[INFO] Login efetuado com sucesso!");
  } catch (err) {
    console.error("[ERRO] Falha no login:", err.message);
    return;
  }

  try {
    console.log("[INFO] Acessando o Aviator...");
    await page.goto('https://www.olabet.co.mz/aviator/', { waitUntil: 'networkidle0' });
  } catch (err) {
    console.error("[ERRO] Não foi possível acessar o Aviator:", err.message);
    return;
  }

  console.log("[INFO] Extração de velas iniciada...");
  setInterval(async () => {
    try {
      const velas = await page.$$eval(
        '.result-history .payout',
        nodes => nodes.map(n => n.textContent.trim()).slice(-20)
      );

      if (velas.length) {
        ultimasVelas = velas;
        console.log(`[INFO] Velas atualizadas: ${velas.join(' | ')}`);
      } else {
        console.warn("[ALERTA] Nenhuma vela encontrada no momento.");
      }
    } catch (err) {
      console.error("[ERRO] Ao extrair velas:", err.message);
    }
  }, 2000);
})();

app.get('/velas', (req, res) => {
  res.json(ultimasVelas);
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.listen(port, () => {
  console.log(`[OK] Servidor rodando em http://localhost:${port}`);
});
