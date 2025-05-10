document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    const resultsContainer = document.getElementById('results-container');
    const loading = document.getElementById('loading');
    const adModal = document.getElementById('ad-modal');
    const adDisplay = document.getElementById('ad-display');
    const closeAdButton = document.getElementById('close-ad');
    const headerAd = document.getElementById('header-ad');
    const topAd = document.getElementById('top-ad');
    const bottomAd = document.getElementById('bottom-ad');

    // Carregar anúncios quando a página for carregada
    loadAds();

    // Configurar evento de busca
    searchButton.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });

    // Função para buscar vídeos
    async function performSearch() {
        const query = searchInput.value.trim();
        if (query === '') return;

        // Mostrar carregamento
        loading.style.display = 'flex';
        resultsContainer.innerHTML = '';

        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            const data = await response.json();

            // Esconder carregamento
            loading.style.display = 'none';

            if (data.length === 0) {
                resultsContainer.innerHTML = '<p class="no-results">Nenhum resultado encontrado.</p>';
                return;
            }

            // Mostrar resultados
            displayResults(data);
        } catch (error) {
            loading.style.display = 'none';
            resultsContainer.innerHTML = '<p class="error">Ocorreu um erro ao buscar. Tente novamente.</p>';
            console.error('Erro na busca:', error);
        }
    }

    // Função para exibir resultados
    function displayResults(results) {
        resultsContainer.innerHTML = '';

        results.forEach((result, index) => {
            // Inserir anúncios entre os resultados (a cada 3 itens)
            if (index > 0 && index % 3 === 0) {
                const adCard = document.createElement('div');
                adCard.className = 'result-card ad-card';
                adCard.innerHTML = '<div class="ad-result" id="ad-result-' + index + '"></div>';
                resultsContainer.appendChild(adCard);
                loadSpecificAd('ad-result-' + index, 'results');
            }

            const resultCard = document.createElement('div');
            resultCard.className = 'result-card';
            resultCard.innerHTML = `
                <img class="result-thumbnail" src="${result.thumbnail}" alt="${result.title}">
                <div class="result-info">
                    <h3 class="result-title">${result.title}</h3>
                    <div class="result-buttons">
                        <button class="download-button mp3-button" data-id="${result.videoId}" data-format="mp3">MP3</button>
                        <button class="download-button mp4-button" data-id="${result.videoId}" data-format="mp4">MP4</button>
                    </div>
                </div>
            `;
            resultsContainer.appendChild(resultCard);
        });

        // Adicionar eventos aos botões de download
        document.querySelectorAll('.download-button').forEach(button => {
            button.addEventListener('click', initiateDownload);
        });
    }

    // Função para iniciar processo de download
    async function initiateDownload(e) {
        const videoId = e.target.getAttribute('data-id');
        const format = e.target.getAttribute('data-format');
        
        // Registrar clique no botão de download
        await fetch('/api/stats/download-click', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ videoId, format })
        });

        // Mostrar anúncio antes do download
        showAdBeforeDownload(videoId, format);
    }

    // Função para mostrar anúncio antes do download
    async function showAdBeforeDownload(videoId, format) {
        try {
            // Buscar anúncio para página de download
            const response = await fetch('/api/ads/random?page=download');
            const ad = await response.json();

            if (ad && ad.id) {
                // Mostrar o anúncio
                adDisplay.innerHTML = '';

                // Registrar visualização do anúncio
                await fetch('/api/stats/ad-view', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ adId: ad.id })
                });

                // Diferentes formatos de anúncio
                if (ad.type === 'iframe') {
                    const iframe = document.createElement('iframe');
                    iframe.src = ad.content;
                    iframe.width = '100%';
                    iframe.height = '300px';
                    iframe.frameBorder = '0';
                    adDisplay.appendChild(iframe);
                } else if (ad.type === 'video') {
                    const video = document.createElement('video');
                    video.src = ad.content;
                    video.controls = true;
                    video.autoplay = true;
                    video.muted = false;
                    adDisplay.appendChild(video);
                } else {
                    // Imagem ou GIF
                    const link = document.createElement('a');
                    link.href = ad.link || '#';
                    link.target = '_blank';
                    link.onclick = async () => {
                        // Registrar clique no anúncio
                        await fetch('/api/stats/ad-click', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ adId: ad.id })
                        });
                    };
                    
                    const img = document.createElement('img');
                    img.src = ad.content;
                    img.alt = 'Anúncio';
                    
                    link.appendChild(img);
                    adDisplay.appendChild(link);
                }

                // Mostrar o modal de anúncio
                adModal.style.display = 'flex';

                // Configurar botão de fechar com contador
                closeAdButton.disabled = true;
                let countdown = 5;
                closeAdButton.textContent = `Fechar [${countdown}s]`;
                
                const countdownInterval = setInterval(() => {
                    countdown--;
                    closeAdButton.textContent = `Fechar [${countdown}s]`;
                    
                    if (countdown <= 0) {
                        clearInterval(countdownInterval);
                        closeAdButton.disabled = false;
                        closeAdButton.textContent = 'Fechar';
                    }
                }, 1000);

                // Limpar o intervalo se o anúncio for fechado
                closeAdButton.onclick = () => {
                    adModal.style.display = 'none';
                    clearInterval(countdownInterval);
                    startDownload(videoId, format);
                };
            } else {
                // Se não encontrar anúncio, inicia o download diretamente
                startDownload(videoId, format);
            }
        } catch (error) {
            console.error('Erro ao carregar anúncio:', error);
            startDownload(videoId, format);
        }
    }

    // Função para iniciar o download propriamente dito
    function startDownload(videoId, format) {
        const downloadUrl = `/api/download?id=${videoId}&format=${format}`;
        window.location.href = downloadUrl;
    }

    // Funções para gerenciar os anúncios
    async function loadAds() {
        try {
            // Carregar anúncio do cabeçalho
            loadSpecificAd('header-ad', 'home');
            
            // Carregar anúncios acima e abaixo dos resultados
            loadSpecificAd('top-ad', 'home');
            loadSpecificAd('bottom-ad', 'home');
        } catch (error) {
            console.error('Erro ao carregar anúncios:', error);
        }
    }

    async function loadSpecificAd(containerId, page) {
        try {
            const response = await fetch(`/api/ads/random?page=${page}`);
            const ad = await response.json();
            const container = document.getElementById(containerId);

            if (ad && ad.id && container) {
                container.innerHTML = '';

                // Registrar visualização do anúncio
                await fetch('/api/stats/ad-view', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ adId: ad.id })
                });

                // Criar elemento com base no tipo de anúncio
                if (ad.type === 'iframe') {
                    const iframe = document.createElement('iframe');
                    iframe.src = ad.content;
                    iframe.width = '100%';
                    iframe.height = '100%';
                    iframe.frameBorder = '0';
                    container.appendChild(iframe);
                } else if (ad.type === 'video') {
                    const video = document.createElement('video');
                    video.src = ad.content;
                    video.controls = true;
                    video.autoplay = true;
                    video.muted = true;
                    video.style.width = '100%';
                    video.style.height = '100%';
                    video.style.objectFit = 'cover';
                    container.appendChild(video);
                } else {
                    // Imagem ou GIF
                    const link = document.createElement('a');
                    link.href = ad.link || '#';
                    link.target = '_blank';
                    link.style.display = 'block';
                    link.style.width = '100%';
                    link.style.height = '100%';
                    link.onclick = async () => {
                        // Registrar clique no anúncio
                        await fetch('/api/stats/ad-click', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ adId: ad.id })
                        });
                    };
                    
                    const img = document.createElement('img');
                    img.src = ad.content;
                    img.alt = 'Anúncio';
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.objectFit = 'cover';
                    
                    link.appendChild(img);
                    container.appendChild(link);
                }
            }
        } catch (error) {
            console.error('Erro ao carregar anúncio específico:', error);
        }
    }
});