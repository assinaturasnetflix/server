document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('current-year-admin').textContent = new Date().getFullYear();

    const adForm = document.getElementById('ad-form');
    const adIdInput = document.getElementById('ad-id');
    const adTitleInput = document.getElementById('ad-title');
    const adTypeInput = document.getElementById('ad-type');
    const adUrlInput = document.getElementById('ad-url');
    const adPositionInput = document.getElementById('ad-position');
    const adStatusInput = document.getElementById('ad-status');
    const clearAdFormButton = document.getElementById('clear-ad-form');
    const adsTableBody = document.getElementById('ads-table-body');
    const statsTableBody = document.getElementById('stats-table-body');

    const API_BASE_URL = ''; // API está no mesmo domínio/porta

    // --- Funções de Anúncio ---
    async function fetchAds() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/ads`);
            if (!response.ok) throw new Error('Failed to fetch ads');
            const ads = await response.json();
            renderAdsTable(ads);
        } catch (error) {
            console.error(error);
            adsTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-red-400">${error.message}</td></tr>`;
        }
    }

    function renderAdsTable(ads) {
        adsTableBody.innerHTML = '';
        if (ads.length === 0) {
            adsTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4">Nenhum anúncio cadastrado.</td></tr>`;
            return;
        }
        ads.forEach(ad => {
            const row = `
                <tr data-id="${ad._id}">
                    <td class="px-4 py-3 whitespace-nowrap">${ad.title}</td>
                    <td class="px-4 py-3 whitespace-nowrap">${ad.type}</td>
                    <td class="px-4 py-3 whitespace-nowrap">${ad.position}</td>
                    <td class="px-4 py-3 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            ad.status === 'active' ? 'bg-green-700 text-green-100' : 'bg-red-700 text-red-100'
                        }">
                            ${ad.status}
                        </span>
                    </td>
                    <td class="px-4 py-3"><span class="url-preview" title="${ad.url.replace(/"/g, '"')}">${ad.url}</span></td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm font-medium">
                        <button class="text-indigo-400 hover:text-indigo-300 mr-2 edit-ad-btn">Editar</button>
                        <button class="text-red-400 hover:text-red-300 delete-ad-btn">Excluir</button>
                    </td>
                </tr>
            `;
            adsTableBody.insertAdjacentHTML('beforeend', row);
        });
    }

    adForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const adData = {
            title: adTitleInput.value,
            type: adTypeInput.value,
            url: adUrlInput.value,
            position: adPositionInput.value,
            status: adStatusInput.value,
        };

        const id = adIdInput.value;
        const method = id ? 'PUT' : 'POST';
        const url = id ? `${API_BASE_URL}/api/ads/${id}` : `${API_BASE_URL}/api/ads`;

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(adData),
            });
            if (!response.ok) {
                const errorResult = await response.json();
                throw new Error(errorResult.error || 'Failed to save ad');
            }
            resetAdForm();
            fetchAds(); // Refresh table
            fetchStats(); // Refresh stats as ad status might change
        } catch (error) {
            console.error(error);
            alert(`Erro ao salvar anúncio: ${error.message}`);
        }
    });

    clearAdFormButton.addEventListener('click', resetAdForm);

    function resetAdForm() {
        adForm.reset();
        adIdInput.value = '';
    }

    adsTableBody.addEventListener('click', async (e) => {
        const target = e.target;
        const row = target.closest('tr');
        if (!row) return;
        const id = row.dataset.id;

        if (target.classList.contains('edit-ad-btn')) {
            // Fetch ad data again to ensure it's fresh
            const response = await fetch(`${API_BASE_URL}/api/ads`);
            const ads = await response.json();
            const ad = ads.find(a => a._id === id);
            if (ad) {
                adIdInput.value = ad._id;
                adTitleInput.value = ad.title;
                adTypeInput.value = ad.type;
                adUrlInput.value = ad.url;
                adPositionInput.value = ad.position;
                adStatusInput.value = ad.status;
                adTitleInput.focus(); // Scroll to form and focus
            }
        } else if (target.classList.contains('delete-ad-btn')) {
            if (confirm('Tem certeza que deseja excluir este anúncio? Esta ação também removerá as estatísticas associadas.')) {
                try {
                    const response = await fetch(`${API_BASE_URL}/api/ads/${id}`, { method: 'DELETE' });
                    if (!response.ok) throw new Error('Failed to delete ad');
                    fetchAds();
                    fetchStats(); // Refresh stats
                } catch (error) {
                    console.error(error);
                    alert(`Erro ao excluir anúncio: ${error.message}`);
                }
            }
        }
    });

    // --- Funções de Estatísticas ---
    async function fetchStats() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/stats`);
            if (!response.ok) throw new Error('Failed to fetch stats');
            const stats = await response.json();
            renderStatsTable(stats);
        } catch (error) {
            console.error(error);
            statsTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-red-400">${error.message}</td></tr>`;
        }
    }

    function renderStatsTable(statsData) {
        statsTableBody.innerHTML = '';
        if (statsData.length === 0) {
            statsTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-4">Nenhuma estatística disponível.</td></tr>`;
            return;
        }
        statsData.forEach(stat => {
            const row = `
                <tr>
                    <td class="px-4 py-3 whitespace-nowrap">${stat.adTitle || 'N/A'}</td>
                    <td class="px-4 py-3 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            stat.adStatus === 'active' ? 'bg-green-700 text-green-100' : 
                            stat.adStatus === 'inactive' ? 'bg-yellow-700 text-yellow-100' : 'bg-gray-600 text-gray-100'
                        }">
                            ${stat.adStatus || 'deletado'}
                        </span>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">${stat.views}</td>
                    <td class="px-4 py-3 whitespace-nowrap">${stat.clicks}</td>
                    <td class="px-4 py-3 whitespace-nowrap">${stat.ctr.toFixed(2)}%</td>
                </tr>
            `;
            statsTableBody.insertAdjacentHTML('beforeend', row);
        });
    }

    // Initial data load
    fetchAds();
    fetchStats();
});