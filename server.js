const express = require('express');
const axios = require('axios');

const app = express();
const port = 3000;

app.use(express.json()); // Para receber JSON no corpo da requisição

// Endpoint para iniciar o pagamento
app.post('/iniciar-pagamento', async (req, res) => {
  const { numero, nome } = req.body;

  // Verifica se os campos obrigatórios foram preenchidos
  if (!numero || !nome) {
    return res.status(400).json({ message: 'Número e nome são obrigatórios.' });
  }

  try {
    // Realiza o pagamento com a API externa
    const response = await axios.post('https://mozpayment.co.mz/api/1.1/wf/pagamentorotativoemola', {
      carteira: "1746519798335x143095610732969980",  // Substitua pelo seu número de carteira
      numero: numero,
      "quem comprou": nome,
      valor: "1"  // Valor do pagamento
    });

    // Checa se o pagamento foi aprovado
    if (response.data.success === 'yes') {
      return res.json({ success: true, message: 'Pagamento aprovado.' });
    } else {
      return res.json({ success: false, message: 'Pagamento não aprovado.' });
    }
  } catch (error) {
    console.error('Erro ao tentar processar o pagamento:', error);
    return res.status(500).json({ success: false, message: 'Erro ao processar o pagamento.' });
  }
});

// Inicia o servidor na porta definida
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
