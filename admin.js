document.addEventListener('DOMContentLoaded', () => {
    // Elementos do login
    const loginContainer = document.getElementById('login-container');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const adminPanel = document.getElementById('admin-panel');

    // Elementos de navegação
    const navDashboard = document.getElementById('nav-dashboard');
    const navAds = document.getElementById('nav-ads');
    const navNewAd = document.getElementById('nav-new-ad');
    const navStatistics = document.getElementById('nav-statistics');
    const logoutButton = document.getElementById('logout-button');

    // Seções
    const dashboardSection = document.getElementById('dashboard-section');
    const adsSection = document.getElementById('ads-section');
    const newAdSection = document.getElementById('new-ad-section');
    const statisticsSection = document.getElementById('statistics-section');

    // Formulário de novo anúncio
    const newAdForm = document.getElementById('new-ad-form');
    const adTypeSelect = document.getElementById('ad-type');
    const uploadContainer = document.getElementById('upload-container');
    const iframeContainer = document.getElementById('iframe-container');
    const adFileInput = document.getElementById('ad-file');
    const uploadPreview = document.getElementById('upload-preview');

    // Gerenciamento de login
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Salvar token no localStorage
                localStorage.setItem('adminToken', data.token);
                
                // Mostrar o painel admin e esconder o login
                loginContainer.style.display = 'none';
                adminPanel.style.display = 'block';
                
                // Carregar dados iniciais
                loadDashboardData();
            } else {
                loginError.textContent = data.message || 'Credenciais inválidas';
            }
        } catch (error) {
            console.error('Erro no login:', error);
            loginError.textContent = 'Erro ao tentar login. Tente novamente.';
        }
    });

    // Verificar se já está logado
    const checkAuth = async () => {
        const token = localStorage.getItem('adminToken');
        
        if (token) {
            try {
                const response = await fetch('/api/admin/verify', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (response.ok) {
                    loginContainer.style.display = 'none';
                    adminPanel.style.display = 'block';
                    loadDashboardData();
                } else {
                    // Token inválido, remover e mostrar login
                    localStorage.removeItem('adminToken');
                }
            } catch (error) {
                console.error('Erro ao verificar autenticação:', error);
            }
        }
    };

    // Logout
    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('adminToken');
        adminPanel.style.display = 'none';
        loginContainer.style.display = 'flex';
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        loginError.textContent = '';
    });

    // Navegação entre seções
    navDashboard.addEventListener('click', () => showSection(dashboardSection, navDashboard));
    navAds.addEventListener('click', () => {
        showSection(adsSection, navAds);
        loadAdsTable();
    });
    navNewAd.addEventListener('click', () => showSection(newAdSection, navNewAd));
    navStatistics.addEventListener('click', () => {
        showSection(statisticsSection, navStatistics);
        loadStatistics();
    });

    function showSection(section, button) {
        // Esconder todas as seções
        dashboardSection.style.display = 'none';
        adsSection.style.display = 'none';
        newAdSection.style.display = 'none';
        statisticsSection.style.display = 'none';
        
        // Remover classe 'active' de todos os botões
        navDashboard.classList.remove('active');
        navAds.classList.remove('active');
        navNewAd.classList.remove('active');
        navStatistics.classList.remove('active');
        
        // Mostrar a seção solicitada e ativar o botão
        section.style.display = 'block';
        button.classList.add('active');
    }

    // Gerenciar tipo de anúncio no formulário
    adTypeSelect.addEventListener('change', () => {
        if (adTypeSelect.value === 'iframe') {
            uploadContainer.style.display = 'none';
            iframeContainer.style.display = 'block';
        } else {
            uploadContainer.style.display = 'block';
            iframeContainer.style.display = 'none';
            
            // Atualizar o tipo de arquivo aceito
            if (adTypeSelect.value === 'image') {
                adFileInput.accept = '.jpg,.jpeg,.png';
            } else if (adTypeSelect.value === 'gif') {
                adFileInput.accept = '.gif';
            } else if (adTypeSelect.value === 'video') {
                adFileInput.accept = '.mp4';
            }
        }
    });

    // Preview de upload
    adFileInput.addEventListener('change', () => {
        const file = adFileInput.files[0];
        if (!file) {
            uploadPreview.innerHTML = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            uploadPreview.innerHTML = '';
            
            if (file.type.startsWith('image/')) {
                const img = document.createElement('img');
                img.src = e.target.result;
                uploadPreview.appendChild(img);
            } else if (file.type.startsWith('video/')) {
                const video = document.createElement('video');
                video.src = e.target.result;
                video.controls = true;
                video.autoplay = false;
                uploadPreview.appendChild(video);
            }
        };
        
        reader.readAsDataURL(file);
    });

    // Envio do formulário de novo anúncio
    newAdForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData();
        formData.append('type', adTypeSelect.value);
        formData.append('page', document.getElementById('ad-page').value);
        formData.append('position', document.getElementById('ad-position').value);
        formData.append('status', document.getElementById('ad-status').value);
        formData.append('link', document.getElementById('ad-link').value);
        
        if (adTypeSelect.value === 'iframe') {
            formData.append('content', document.getElementById('iframe-code').value);
        } else {
            formData.append('file', adFileInput.files[0]);
        }
        
        try {
            const token = localStorage.getItem('adminToken');
            const response = await fetch('/api/admin/ads', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });
            
            const data = await response.json();
            
            if (response.ok) {
                alert('Anúncio salvo com sucesso!');
                newAdForm.reset();
                uploadPreview.innerHTML = '';
            } else {
                alert('Erro ao salvar anúncio: ' + (data.message || 'Erro desconhecido'));
            }
        } catch (error) {
            console.error('Erro ao enviar anúncio:', error);
            alert('Erro ao enviar anúncio. Verifique o console para mais detalhes.');
        }
    });

    // Carregar dados do Dashboard
    async function loadDashboardData() {
        try {
            const token = localStorage.getItem('adminToken');
            const response = await fetch('/api/admin/dashboard', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            const data = await response.json();
            
            if (response.ok) {
                document.getElementById('total-ads').textContent = data.totalAds;
                document.getElementById('today-views').textContent = data.todayViews;
                document.getElementById('today-clicks').textContent = data.todayClicks;
                document.getElementById('today-downloads').textContent = data.todayDownloads;
                
                // Preencher tabela de atividade recente
                const activityTable = document.getElementById('recent-activity-table').querySelector('tbody');
                activityTable.innerHTML = '';
                
                data.recentActivity.forEach(activity => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${activity.type}</td>
                        <td>${activity.details}</td>
                        <td>${new Date(activity.timestamp).toLocaleString()}</td>
                    `;
                    activityTable.appendChild(row);
                });
            }
        } catch (error) {
            console.error('Erro ao carregar dados do dashboard:', error);
        }
    }

    // Carregar tabela de anúncios
    async function loadAdsTable() {
        try {
            const token = localStorage.getItem('adminToken');
            const typeFilter = document.getElementById('ad-type-filter').value;
            const pageFilter = document.getElementById('ad-page-filter').value;
            
            const response = await fetch(`/api/admin/ads?type=${typeFilter}&page=${pageFilter}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            const data = await response.json();
            
            if (response.ok) {
                const adsTable = document.getElementById('ads-table').querySelector('tbody');
                adsTable.innerHTML = '';
                
                data.forEach(ad => {
                    const row = document.createElement('tr');
                    
                    // Calcular CTR (Click-Through Rate)
                    const ctr = ad.views > 0 ? ((ad.clicks / ad.views) * 100).toFixed(2) + '%' : '0%';
                    
                    // Criar preview adequado para o tipo de anúncio
                    let preview = '';
                    if (ad.type === 'iframe') {
                        preview = '<span class="iframe-placeholder">[iFrame]</span>';
                    } else {
                        preview = `<img src="${ad.content}" class="ad-preview" alt="Preview">`;
                    }
                    
                    row.innerHTML = `
                        <td>${ad.id}</td>
                        <td>${preview}</td>
                        <td>${ad.type}</td>
                        <td>${ad.page}</td>
                        <td>${ad.status}</td>
                        <td>${ad.views}</td>
                        <td>${ad.clicks}</td>
                        <td>${ctr}</td>
                        <td class="ad-actions">
                            <button class="btn-toggle" data-id="${ad.id}" data-status="${ad.status}">
                                ${ad.status === 'active' ? 'Desativar' : 'Ativar'}
                            </button>
                            <button class="btn-delete" data-id="${ad.id}">Excluir</button>
                        </td>
                    `;
                    adsTable.appendChild(row);
                });
                
                // Adicionar eventos aos botões
                document.querySelectorAll('.btn-toggle').forEach(button => {
                    button.addEventListener('click', toggleAdStatus);
                });
                
                document.querySelectorAll('.btn-delete').forEach(button => {
                    button.addEventListener('click', deleteAd);
                });
            }
        } catch (error) {
            console.error('Erro ao carregar tabela de anúncios:', error);
        }
    }

    // Alternar status do anúncio
    async function toggleAdStatus(e) {
        const adId = e.target.getAttribute('data-id');
        const currentStatus = e.target.getAttribute('data-status');
        const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
        
        try {
            const token = localStorage.getItem('adminToken');
            const response = await fetch(`/api/admin/ads/${adId}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status: newStatus })
            });
            
            if (response.ok) {
                // Atualizar a tabela
                loadAdsTable();
            } else {
                alert('Erro ao alterar status do anúncio');
            }
        } catch (error) {
            console.error('Erro ao alterar status:', error);
        }
    }

    // Excluir anúncio
    async function deleteAd(e) {
        if (!confirm('Tem certeza que deseja excluir este anúncio?')) {
            return;
        }
        
        const adId = e.target.getAttribute('data-id');
        
        try {
            const token = localStorage.getItem('adminToken');
            const response = await fetch(`/api/admin/ads/${adId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                // Atualizar a tabela
                loadAdsTable();
            } else {
                alert('Erro ao excluir anúncio');
            }
        } catch (error) {
            console.error('Erro ao excluir anúncio:', error);
        }
    }

    // Carregar estatísticas
    async function loadStatistics() {
        try {
            const token = localStorage.getItem('adminToken');
            const period = document.getElementById('stat-period').value;
            
            const response = await fetch(`/api/admin/statistics?period=${period}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            const data = await response.json();
            
            if (response.ok) {
                // Preencher tabela de top anúncios
                const topAdsTable = document.getElementById('top-ads-table').querySelector('tbody');
                topAdsTable.innerHTML = '';
                
                data.topAds.forEach(ad => {
                    const row = document.createElement('tr');
                    const ctr = ad.views > 0 ? ((ad.clicks / ad.views) * 100).toFixed(2) + '%' : '0%';
                    
                    let preview = '';
                    if (ad.type === 'iframe') {
                        preview = '<span class="iframe-placeholder">[iFrame]</span>';
                    } else {
                        preview = `<img src="${ad.content}" class="ad-preview" alt="Preview">`;
                    }
                    
                    row.innerHTML = `
                        <td>${ad.id}</td>
                        <td>${preview}</td>
                        <td>${ad.views}</td>
                        <td>${ad.clicks}</td>
                        <td>${ctr}</td>
                    `;
                    topAdsTable.appendChild(row);
                });
                
                // Preencher tabela de buscas populares
                const topSearchesTable = document.getElementById('top-searches-table').querySelector('tbody');
                topSearchesTable.innerHTML = '';
                
                data.topSearches.forEach(search => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${search.term}</td>
                        <td>${search.count}</td>
                        <td>${search.downloads}</td>
                    `;
                    topSearchesTable.appendChild(row);
                });
                
                // Em uma implementação real, aqui carrregaríamos gráficos com uma biblioteca como Chart.js
                // Para simplicidade, vamos apenas exibir um placeholder
                document.getElementById('ads-performance-chart').innerHTML = 
                    '<div style="text-align:center;padding:2rem;background:#f5f5f5;">Gráfico de Desempenho de Anúncios</div>';
                
                document.getElementById('downloads-chart').innerHTML = 
                    '<div style="text-align:center;padding:2rem;background:#f5f5f5;">Gráfico de Downloads por Formato</div>';
            }
        } catch (error) {
            console.error('Erro ao carregar estatísticas:', error);
        }
    }

    // Configurar eventos de atualização
    document.getElementById('refresh-ads').addEventListener('click', loadAdsTable);
    document.getElementById('refresh-stats').addEventListener('click', loadStatistics);
    document.getElementById('stat-period').addEventListener('change', loadStatistics);
    document.getElementById('ad-type-filter').addEventListener('change', loadAdsTable);
    document.getElementById('ad-page-filter').addEventListener('change', loadAdsTable);

    // Verificar autenticação ao carregar a página
    checkAuth();
});