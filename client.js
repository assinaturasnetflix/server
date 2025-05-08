document.addEventListener('DOMContentLoaded', () => {
  // Elementos do DOM
  const keyInput = document.getElementById('key-input');
  const activateKeyBtn = document.getElementById('activate-key');
  const generateSignalBtn = document.getElementById('generate-signal');
  const licenseStatus = document.getElementById('license-status');
  const licenseDetails = document.getElementById('license-details');
  const licenseType = document.getElementById('license-type');
  const licenseRemaining = document.getElementById('license-remaining');
  const dashboard = document.getElementById('dashboard');
  const candlesDisplay = document.getElementById('candles-display');
  const rosesDisplay = document.getElementById('roses-display');
  const loader = document.getElementById('loader');
  const errorModal = document.getElementById('error-modal');
  const errorTitle = document.getElementById('error-title');
  const errorMessage = document.getElementById('error-message');
  const closeErrorBtn = document.getElementById('close-error');

  // Estado da aplicação
  const state = {
    activeKey: null,
    keyDetails: null,
    roses: [],
    candles: []
  };

  // Verificar se há uma chave salva no localStorage
  const savedKey = localStorage.getItem('cacadorRosasKey');
  if (savedKey) {
    keyInput.value = savedKey;
    validateKey(savedKey);
  }

  // Event Listeners
  activateKeyBtn.addEventListener('click', () => {
    const keyCode = keyInput.value.trim();
    if (keyCode.length < 4) {
      showError('Chave Inválida', 'Por favor, digite uma chave de acesso válida.');
      return;
    }
    
    validateKey(keyCode);
  });

  generateSignalBtn.addEventListener('click', generateSignal);

  closeErrorBtn.addEventListener('click', () => {
    errorModal.style.display = 'none';
  });

  // Função para validar a chave
  async function validateKey(keyCode) {
    showLoader();
    
    try {
      const response = await fetch('/keys/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ keyCode }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Erro ao validar chave');
      }
      
      if (!data.success) {
        throw new Error(data.message || 'Chave inválida');
      }
      
      if (!data.key.isValid) {
        showError('Chave Expirada', 'Esta chave de acesso expirou. Por favor, utilize uma nova chave.');
        hideLoader();
        return;
      }
      
      // Salvar chave no localStorage
      localStorage.setItem('cacadorRosasKey', keyCode);
      
      // Atualizar estado da aplicação
      state.activeKey = keyCode;
      state.keyDetails = data.key;
      
      // Atualizar interface
      updateLicenseInfo();
      dashboard.classList.remove('hidden');
      
      hideLoader();
    } catch (error) {
      console.error('Erro:', error);
      showError('Erro de Validação', error.message || 'Erro ao validar a chave de acesso.');
      hideLoader();
    }
  }

  // Função para atualizar informações da licença
  function updateLicenseInfo() {
    if (state.keyDetails) {
      licenseStatus.className = 'license-status active';
      licenseStatus.querySelector('.status-text').textContent = 'Ativo';
      
      licenseDetails.classList.remove('hidden');
      licenseType.textContent = `${state.keyDetails.type} dias`;
      licenseRemaining.textContent = state.keyDetails.daysRemaining;
    } else {
      licenseStatus.className = 'license-status inactive';
      licenseStatus.querySelector('.status-text').textContent = 'Inativo';
      
      licenseDetails.classList.add('hidden');
    }
  }

  // Função para gerar sinais (velas e rosas)
  function generateSignal() {
    if (!state.activeKey) {
      showError('Acesso Negado', 'Você precisa ativar uma chave válida para gerar sinais.');
      return;
    }
    
    showLoader();
    
    // Simular geração de 10 velas
    const newCandles = [];
    let newRoses = [];
    
    // Determinar quantas rosas vão aparecer (1-3 rosas a cada 10 velas)
    const roseCount = Math.floor(Math.random() * 3) + 1;
    
    // Determinar as posições das rosas (índices aleatórios entre 0-9)
    const rosePositions = [];
    while (rosePositions.length < roseCount) {
      const pos = Math.floor(Math.random() * 10);
      if (!rosePositions.includes(pos)) {
        rosePositions.push(pos);
      }
    }
    
    // Gerar 10 velas
    for (let i = 0; i < 10; i++) {
      let color;
      
      if (rosePositions.includes(i)) {
        color = 'pink';
        // Criar uma nova rosa com horário atual
        const now = new Date();
        const formattedTime = formatDateTime(now);
        newRoses.push({
          id: Date.now() + i,
          timestamp: formattedTime,
          passed: false
        });
      } else {
        // Alternando entre azul e roxo para as velas não-rosa
        color = Math.random() > 0.5 ? 'blue' : 'purple';
      }
      
      newCandles.push(color);
    }
    
    // Atualizar o estado
    state.candles = [...state.candles, ...newCandles];
    state.roses = [...state.roses, ...newRoses];
    
    // Atualizar a interface
    updateCandlesDisplay(newCandles);
    updateRosesDisplay();
    
    hideLoader();
    
    // Iniciar verificação periódica para marcar rosas como "Passou"
    startRoseTimer();
  }

  // Função para atualizar o display de velas
  function updateCandlesDisplay(newCandles) {
    // Adicionar novas velas ao display
    newCandles.forEach(color => {
      const candleElement = document.createElement('div');
      candleElement.className = `candle ${color}`;
      candlesDisplay.appendChild(candleElement);
    });
  }

  // Função para atualizar o display de rosas
  function updateRosesDisplay() {
    // Limpar o display atual
    rosesDisplay.innerHTML = '';
    
    // Mostrar todas as rosas, ordenadas da mais recente para a mais antiga
    state.roses.sort((a, b) => {
      return new Date(b.timestamp) - new Date(a.timestamp);
    }).forEach(rose => {
      const roseElement = document.createElement('div');
      roseElement.className = `rose ${rose.passed ? 'passed' : ''}`;
      
      const timeElement = document.createElement('div');
      timeElement.className = 'rose-time';
      timeElement.textContent = rose.timestamp;
      
      roseElement.appendChild(timeElement);
      
      if (rose.passed) {
        const statusElement = document.createElement('div');
        statusElement.className = 'rose-status';
        statusElement.textContent = 'Passou';
        roseElement.appendChild(statusElement);
      }
      
      rosesDisplay.appendChild(roseElement);
    });
  }

  // Função para iniciar o timer que verifica se as rosas passaram
  function startRoseTimer() {
    // Verificar a cada segundo se alguma rosa passou do horário
    setInterval(() => {
      let updated = false;
      const now = new Date();
      
      state.roses.forEach(rose => {
        if (!rose.passed) {
          const roseTime = new Date(rose.timestamp);
          // Consideramos que a rosa "passou" após 1 minuto do seu surgimento
          const expirationTime = new Date(roseTime.getTime() + 60000);
          
          if (now > expirationTime) {
            rose.passed = true;
            updated = true;
          }
        }
      });
      
      if (updated) {
        updateRosesDisplay();
      }
    }, 1000);
  }

  // Função para formatar data e hora
  function formatDateTime(date) {
    const pad = (num) => num.toString().padStart(2, '0');
    
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  }

  // Função para mostrar o loader
  function showLoader() {
    loader.classList.remove('hidden');
  }

  // Função para esconder o loader
  function hideLoader() {
    loader.classList.add('hidden');
  }

  // Função para mostrar mensagens de erro
  function showError(title, message) {
    errorTitle.textContent = title;
    errorMessage.textContent = message;
    errorModal.style.display = 'flex';
  }