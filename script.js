document.addEventListener('DOMContentLoaded', () => {
    const searchForm = document.getElementById('search-form');
    const searchQueryInput = document.getElementById('search-query');
    const resultsContainer = document.getElementById('results-container');
    const resultsTitle = document.getElementById('results-title');
    const loadingIndicator = document.getElementById('loading-indicator');
    const errorMessageDiv = document.getElementById('error-message');
    
    const popularVideosContainer = document.getElementById('popular-videos-container');
    const popularLoadingIndicator = document.getElementById('popular-loading-indicator');

    document.getElementById('current-year').textContent = new Date().getFullYear();

    // --- Ad Management ---
    const adPlaceholders = {
        footer: document.getElementById('ad-footer'),
        modal: document.getElementById('ad-modal-content'),
        body_top: document.getElementById('ad-body-top'),
        body_bottom: document.getElementById('ad-body-bottom')
    };
    const adModal = document.getElementById('ad-modal');
    const closeModalAdButton = document.getElementById('close-modal-ad');

    if (closeModalAdButton) {
        closeModalAdButton.addEventListener('click', () => {
            adModal.classList.add('hidden');
            recordAdEvent(adModal.dataset.adId, 'close'); // or don't record close
        });
    }

    async function recordAdEvent(adId, type) {
        if (!adId) return;
        try {
            await fetch('/api/stats/record', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adId, type }) // type can be 'view' or 'click'
            });
        } catch (error) {
            console.error('Failed to record ad event:', error);
        }
    }

    function displayAd(adData, placeholderElement) {
        if (!adData || !placeholderElement) return;

        placeholderElement.innerHTML = ''; // Clear previous ad
        placeholderElement.dataset.adId = adData._id; // Store ad ID for click tracking

        let adContent = '';
        if (adData.type === 'image') {
            adContent = `<a href="${adData.url}" target="_blank" data-ad-id="${adData._id}" class="ad-link"><img src="${adData.url}" alt="${adData.title}" class="max-w-full h-auto rounded"></a>`;
        } else if (adData.type === 'gif') {
            adContent = `<a href="#" data-ad-id="${adData._id}" class="ad-link"><img src="${adData.url}" alt="${adData.title}" class="max-w-full h-auto rounded"></a>`; // GIF might not have a link, or you can make it clickable
        } else if (adData.type === 'video') {
            adContent = `<video controls src="${adData.url}" class="max-w-full rounded"></video>`;
        } else if (adData.type === 'iframe') {
            // Sanitize iframe content slightly - ensure it's an embed URL or known safe source
            // For YouTube embeds, ensure `src` is like `https://www.youtube.com/embed/...`
            if (adData.url.includes("<iframe")) { // if full iframe tag is provided
                 adContent = adData.url;
            } else { // if only src is provided
                 adContent = `<iframe src="${adData.url}" frameborder="0" allowfullscreen class="w-full h-64 rounded"></iframe>`;
            }
        }
        
        const adWarning = `<p class="ad-warning">Este é um anúncio.</p>`;
        placeholderElement.innerHTML = adContent + adWarning;

        // Record view
        recordAdEvent(adData._id, 'view');

        // Add click listener for non-iframe ads with links
        const adLink = placeholderElement.querySelector('.ad-link');
        if (adLink) {
            adLink.addEventListener('click', (e) => {
                // Don't prevent default for actual links, just record click
                recordAdEvent(adLink.dataset.adId, 'click');
            });
        }
         // For iframes, clicks inside are harder to track without postMessage API
         // For video elements, one might track 'play' events as a form of engagement.
    }

    async function fetchAndDisplayAds() {
        for (const position in adPlaceholders) {
            if (adPlaceholders[position]) {
                try {
                    const response = await fetch(`/api/ads/serve?position=${position}`);
                    if (response.ok) {
                        const adData = await response.json();
                        if (adData && adData._id) { // Check if an ad was returned
                           if (position === 'modal') {
                                displayAd(adData, adPlaceholders.modal);
                                adModal.classList.remove('hidden');
                                adModal.dataset.adId = adData._id; // For close event
                            } else {
                                displayAd(adData, adPlaceholders[position]);
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Failed to load ad for ${position}:`, error);
                }
            }
        }
    }
    // --- End Ad Management ---

    function showLoading(isLoading, popular = false) {
        const loader = popular ? popularLoadingIndicator : loadingIndicator;
        if (isLoading) {
            loader.classList.remove('hidden');
            if (!popular) {
                resultsContainer.innerHTML = '';
                resultsTitle.classList.add('sr-only');
                errorMessageDiv.classList.add('hidden');
            } else {
                popularVideosContainer.innerHTML = '';
            }
        } else {
            loader.classList.add('hidden');
        }
    }
    
    function showError(message) {
        errorMessageDiv.classList.remove('hidden');
        errorMessageDiv.querySelector('p').textContent = message;
        resultsContainer.innerHTML = '';
        resultsTitle.classList.add('sr-only');
    }

    function displayResults(videos, container, isPopular = false) {
        container.innerHTML = ''; // Clear previous results or loading
        if (videos.length === 0) {
            container.innerHTML = `<p class="col-span-full text-center text-gray-400">Nenhum vídeo encontrado.</p>`;
            if (!isPopular) resultsTitle.classList.add('sr-only');
            return;
        }

        if (!isPopular) resultsTitle.classList.remove('sr-only');

        videos.forEach(video => {
            const videoId = video.id.videoId || video.id; // Search result vs direct video object
            const title = video.snippet.title;
            const thumbnailUrl = video.snippet.thumbnails.medium.url; // Or high for better quality

            const card = `
                <div class="video-card bg-gray-800 rounded-lg shadow-lg overflow-hidden flex flex-col">
                    <img src="${thumbnailUrl}" alt="${title}" class="w-full h-48 object-cover">
                    <div class="p-4 flex flex-col flex-grow">
                        <h4 class="text-md font-semibold mb-2 h-16 overflow-hidden">${title}</h4>
                        <div class="mt-auto flex space-x-2">
                            <button onclick="navigateToDownload('${videoId}', 'mp3', '${encodeURIComponent(title)}', '${encodeURIComponent(thumbnailUrl)}')"
                                    class="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm py-2 px-3 rounded transition duration-150">
                                Baixar MP3
                            </button>
                            <button onclick="navigateToDownload('${videoId}', 'mp4', '${encodeURIComponent(title)}', '${encodeURIComponent(thumbnailUrl)}')"
                                    class="flex-1 bg-gray-600 hover:bg-gray-700 text-white text-sm py-2 px-3 rounded transition duration-150">
                                Baixar MP4
                            </button>
                        </div>
                    </div>
                </div>
            `;
            container.innerHTML += card;
        });
    }
    
    // Make navigateToDownload globally accessible
    window.navigateToDownload = (videoId, format, title, thumbnailUrl) => {
        const url = `download.html?videoId=${videoId}&format=${format}&title=${title}&thumbnail=${thumbnailUrl}`;
        window.location.href = url;
    };

    if (searchForm) {
        searchForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const query = searchQueryInput.value.trim();
            if (!query) {
                showError("Por favor, insira um termo de busca.");
                return;
            }
            
            showLoading(true);
            resultsContainer.innerHTML = ''; // Clear previous results

            try {
                const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `Erro ${response.status} na busca.`);
                }
                const items = await response.json();
                displayResults(items, resultsContainer);
            } catch (error) {
                console.error('Search error:', error);
                showError(error.message || 'Falha ao buscar vídeos. Tente novamente.');
            } finally {
                showLoading(false);
            }
        });
    }

    async function fetchPopularVideos() {
        if (!popularVideosContainer) return;
        showLoading(true, true);
        try {
            const response = await fetch('/api/popular');
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Erro ${response.status} ao buscar populares.`);
            }
            const items = await response.json();
            displayResults(items, popularVideosContainer, true);
        } catch (error) {
            console.error('Popular videos error:', error);
            popularVideosContainer.innerHTML = `<p class="col-span-full text-center text-red-400">Não foi possível carregar vídeos populares.</p>`;
        } finally {
            showLoading(false, true);
        }
    }

    // Initial actions
    fetchPopularVideos();
    fetchAndDisplayAds(); // Load ads on page load
    // Potentially show a modal ad after a delay or user interaction
    // setTimeout(() => {
    //     if (adModal && adModal.classList.contains('hidden') && adPlaceholders.modal.innerHTML.trim() !== '') {
    //         adModal.classList.remove('hidden');
    //     }
    // }, 5000); // Example: show modal ad after 5 seconds if not already shown
});