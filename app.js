class StyleAI {
    constructor() {
        this.initializeElements();
        this.initializeState();
        this.setupEventListeners();
    }

    initializeElements() {
        this.form = document.getElementById('preferencesForm');
        this.locationInput = document.getElementById('location');
        this.locationBtn = document.getElementById('getLocation');
        this.weatherInfo = document.getElementById('weatherInfo');
        this.outfitGrid = document.getElementById('outfitGrid');
        this.favoritesGrid = document.getElementById('favoritesGrid');
        this.loadingOverlay = document.getElementById('loadingOverlay');
    }

    initializeState() {
        this.favorites = JSON.parse(localStorage.getItem('favorites')) || [];
        this.currentRecommendations = null;
    }

    setupEventListeners() {
        this.form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        this.locationBtn.addEventListener('click', () => this.getCurrentLocation());
        window.addEventListener('load', () => this.displayFavorites());
    }

    async getCurrentLocation() {
        try {
            this.showLoading();
            this.locationBtn.disabled = true;
    
            const position = await this.getGeolocationPosition();
            const weatherData = await this.getWeatherFromCoords(position.coords);
            
            this.locationInput.value = weatherData.name;
            this.displayWeatherInfo(weatherData);
    
          
            
        } catch (error) {
            console.error('Location Error:', error);
            this.showError(error.message);
        } finally {
            this.hideLoading();
            this.locationBtn.disabled = false;
        }
    }

    getGeolocationPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported by your browser'));
            }
            navigator.geolocation.getCurrentPosition(resolve, reject);
        });
    }

    async getWeatherFromCoords(coords) {
        try {
            const { latitude, longitude } = coords;
            const response = await fetch(
                `${CONFIG.WEATHER_API_BASE_URL}/current.json?key=${CONFIG.WEATHER_API_KEY}&q=${latitude},${longitude}`
            );
            const data = await response.json();
            return this.formatWeatherData(data);
        } catch (error) {
            console.error('Weather API Error:', error);
            throw new Error('Could not fetch weather data for your location.');
        }
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        this.showLoading();

        try {
            const formData = this.getFormData();
            if (!formData.location) {
                throw new Error('Please enter a location');
            }

            const weatherData = await this.getWeatherData(formData.location);
            this.displayWeatherInfo(weatherData);
            
            const recommendations = await this.getAIRecommendations(weatherData, formData);
            this.displayRecommendations(recommendations);
        } catch (error) {
            console.error('Form submission error:', error);
            this.showError(error.message);
        } finally {
            this.hideLoading();
        }
    }

    getFormData() {
        return {
            style: document.getElementById('style').value,
            occasion: document.getElementById('occasion').value,
            gender: document.getElementById('gender').value,
            location: this.locationInput.value,
            colors: Array.from(document.querySelectorAll('input[name="colors"]:checked'))
                .map(input => input.value)
        };
    }

    async getWeatherData(location) {
        try {
            const response = await fetch(
                `${CONFIG.WEATHER_API_BASE_URL}/current.json?key=${CONFIG.WEATHER_API_KEY}&q=${location}`
            );
            const data = await response.json();

            if (data.error) {
                throw new Error(data.error.message || 'City not found');
            }

            return this.formatWeatherData(data);
        } catch (error) {
            console.error('Weather API Error:', error);
            throw new Error('Could not fetch weather data. Please try again later.');
        }
    }

    async getAIRecommendations(weatherData, preferences) {
        try {
            const prompt = `
                You are a professional fashion stylist. Provide a comprehensive outfit recommendation 
                based on the following specific details:
        
                Context:
                - Temperature: ${weatherData.current.temp_c}°C
                - Weather: ${weatherData.weather[0].description}
                - Style Preference: ${preferences.style}
                - Occasion: ${preferences.occasion}
                - Gender: ${preferences.gender}
                - Preferred Colors: ${preferences.colors.length > 0 ? preferences.colors.join(', ') : 'Any'}
        
                INSTRUCTIONS:
                1. Generate detailed recommendations for each category
                2. Ensure recommendations are practical and specific
                3. Align suggestions with the given style and occasion
                4. Consider weather conditions in your recommendations
                5. Tailor suggestions based on the client's gender
        
                Provide your response in the following structured format:
                {
                    "topSuggestions": ["Specific top recommendation"],
                    "bottomSuggestions": ["Specific bottom recommendation"],
                    "shoeSuggestions": ["Specific shoe recommendation"],
                    "accessorySuggestions": ["Specific accessory recommendation"],
                    "styleTips": ["Practical styling advice"],
                    "weatherAdvice": ["Weather-appropriate advice"]
                }
            `;

            const response = await fetch(`${CONFIG.GEMINI_API_URL}?key=${CONFIG.GEMINI_API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.9,
                        maxOutputTokens: 1000
                    }
                })
            });

            const data = await response.json();

            if (!data.candidates || !data.candidates[0]?.content?.parts[0]?.text) {
                throw new Error('No valid response from AI service');
            }

            const aiResponse = data.candidates[0].content.parts[0].text;
            const parsedRecommendations = this.parseAIResponse(aiResponse);

            return {
                aiSuggestions: parsedRecommendations
            };

        } catch (error) {
            console.error('AI Recommendation Error:', error);
            throw new Error('Unable to generate AI recommendations. Please try again.');
        }
    }

    parseAIResponse(responseText) {
        try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            return JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
        } catch (error) {
            console.error('JSON Parsing Error:', error);
            return this.createStructuredResponse(responseText);
        }
    }

    createStructuredResponse(text) {
        const lines = text.split('\n').filter(line => line.trim());
        const response = {
            topSuggestions: [],
            bottomSuggestions: [],
            shoeSuggestions: [],
            accessorySuggestions: [],
            styleTips: [],
            weatherAdvice: []
        };

        let currentCategory = null;
        for (const line of lines) {
            if (line.toLowerCase().includes('top')) {
                currentCategory = 'topSuggestions';
            } else if (line.toLowerCase().includes('bottom')) {
                currentCategory = 'bottomSuggestions';
            } else if (line.toLowerCase().includes('shoe')) {
                currentCategory = 'shoeSuggestions';
            } else if (line.toLowerCase().includes('accessor')) {
                currentCategory = 'accessorySuggestions';
            } else if (line.toLowerCase().includes('style tip')) {
                currentCategory = 'styleTips';
            } else if (line.toLowerCase().includes('weather')) {
                currentCategory = 'weatherAdvice';
            } else if (currentCategory && line.trim()) {
                response[currentCategory].push(line.trim());
            }
        }

        Object.keys(response).forEach(key => {
            if (response[key].length === 0) {
                response[key].push('No specific recommendations available');
            }
        });

        return response;
    }

    displayWeatherInfo(weatherData) {
        const html = `
            <div class="weather-card fade-in">
                <div class="weather-icon">
                    <img src="${weatherData.weather[0].icon}" alt="Weather icon">
                </div>
                <div class="weather-details">
                    <h3>${weatherData.name}</h3>
                    <p class="temperature">${Math.round(weatherData.current.temp_c)}°C</p>
                    <p class="description">${weatherData.weather[0].description}</p>
                </div>
            </div>
        `;
        this.weatherInfo.innerHTML = html;
    }

    displayRecommendations(recommendationData) {
        const { aiSuggestions } = recommendationData;
    
        const html = `
            <div class="ai-recommendations glass-card">
                <h3><i class="fas fa-robot"></i> AI Style Suggestions</h3>
                
                <div class="recommendations-row main-items">
                    ${this.createRecommendationCard('Tops', aiSuggestions.topSuggestions, 'fa-tshirt')}
                    ${this.createRecommendationCard('Bottoms', aiSuggestions.bottomSuggestions, 'fa-socks')}
                    ${this.createRecommendationCard('Shoes', aiSuggestions.shoeSuggestions, 'fa-shoe-prints')}
                </div>
                
                <div class="recommendations-row secondary-items">
                    ${this.createRecommendationCard('Accessories', aiSuggestions.accessorySuggestions, 'fa-gem')}
                    ${this.createRecommendationCard('Style Tips', aiSuggestions.styleTips, 'fa-lightbulb')}
                    ${this.createRecommendationCard('Weather Advice', aiSuggestions.weatherAdvice, 'fa-cloud-sun')}
                </div>
            </div>
        `;
    
        this.outfitGrid.innerHTML = html;
        this.addFavoriteListeners();
    }

    createRecommendationCard(title, items, icon) {
        const typeSlug = title.toLowerCase().replace(' ', '-');
        return `
            <div class="recommendation-card" data-type="${typeSlug}">
                <h3><i class="fas ${icon}"></i> ${title}</h3>
                <ul>
                    ${items.map(item => {
                        const isInFavorites = this.favorites.some(fav => 
                            fav.name === item && fav.category === title.toLowerCase()
                        );
                        return `
                            <li>
                                <span>${item}</span>
                                <button class="favorite-btn ${isInFavorites ? 'active' : ''}" 
                                        data-item="${item}" 
                                        data-category="${title.toLowerCase()}">
                                    <i class="fas ${isInFavorites ? 'fa-heart' : 'fa-heart-broken'}"></i>
                                </button>
                            </li>
                        `;
                    }).join('')}
                </ul>
            </div>
        `;
    }

    addFavoriteListeners() {
        const favoriteButtons = document.querySelectorAll('.favorite-btn');
        favoriteButtons.forEach(btn => {
            const item = btn.getAttribute('data-item');
            const category = btn.getAttribute('data-category');
            
            
            const isInFavorites = this.favorites.some(fav => 
                fav.name === item && fav.category === category
            );
    
           
            if (isInFavorites) {
                btn.classList.add('active');
                btn.querySelector('i').classList.add('fa-heart');
                btn.querySelector('i').classList.remove('fa-heart-broken');
            }
    
            btn.addEventListener('click', () => {
                const itemId = `${category}-${Date.now()}`;
                this.toggleFavorite(itemId, item, category);
                btn.classList.toggle('active');
                const icon = btn.querySelector('i');
                icon.classList.toggle('fa-heart');
                icon.classList.toggle('fa-heart-broken');
            });
        });
    }

    displayFavorites() {
        if (this.favorites.length === 0) {
            this.favoritesGrid.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-heart-broken"></i>
                    <p>No favorite outfits yet. Like an item to save it here!</p>
                </div>`;
            return;
        }
    
        const categories = this.favorites.reduce((acc, item) => {
            if (!acc[item.category]) acc[item.category] = [];
            acc[item.category].push(item);
            return acc;
        }, {});
    
        const html = Object.entries(categories).map(([category, items]) => `
            <div class="favorite-category">
                <h4>${this.formatCategoryName(category)}</h4>
                <ul>
                    ${items.map(fav => `
                        <li>
                            <span>${fav.name}</span>
                            <div class="favorite-actions">
                                <button class="remove-btn" 
                                    data-id="${fav.id}" 
                                    data-item="${fav.name}"
                                    data-category="${fav.category}"
                                    title="Remove from favorites">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `).join('');
    
        this.favoritesGrid.innerHTML = html;
        this.addRemoveListeners();
    }

    addRemoveListeners() {
        const removeButtons = this.favoritesGrid.querySelectorAll('.remove-btn');
        removeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const itemId = e.currentTarget.getAttribute('data-id');
                this.removeFavorite(itemId);
            });
        });
    }

    removeFavorite(itemId) {
        
        const itemToRemove = this.favorites.find(fav => fav.id === itemId);
        
       
        this.favorites = this.favorites.filter(fav => fav.id !== itemId);
        localStorage.setItem('favorites', JSON.stringify(this.favorites));
        
       
        this.displayFavorites();
    
      
        if (itemToRemove) {
            const recommendationButtons = document.querySelectorAll('.favorite-btn');
            recommendationButtons.forEach(btn => {
                const btnItem = btn.getAttribute('data-item');
                const btnCategory = btn.getAttribute('data-category');
                
                if (btnItem === itemToRemove.name && btnCategory === itemToRemove.category) {
                   
                    btn.classList.remove('active');
                   
                    const icon = btn.querySelector('i');
                    icon.classList.remove('fa-heart');
                    icon.classList.add('fa-heart-broken');
                }
            });
        }
    }

    toggleFavorite(itemId, item, category) {
       
        const existingItem = this.favorites.find(fav => 
            fav.name === item && fav.category === category
        );
        
        if (existingItem) {
        
            this.favorites = this.favorites.filter(fav => fav.id !== existingItem.id);
        } else {
           
            this.favorites.push({ id: itemId, name: item, category });
        }
    
        localStorage.setItem('favorites', JSON.stringify(this.favorites));
        this.displayFavorites();
    }

    formatCategoryName(category) {
        const names = {
            tops: 'Tops',
            bottoms: 'Bottoms',
            shoes: 'Shoes',
            accessories: 'Accessories',
            'style tips': 'Style Tips',
            'weather advice': 'Weather Advice'
        };
        return names[category.toLowerCase()] || category;
    }

    formatWeatherData(data) {
        return {
            name: data.location.name,
            current: {
                temp_c: data.current.temp_c
            },
            weather: [{
                description: data.current.condition.text,
                icon: data.current.condition.icon.startsWith('//') 
                    ? 'https:' + data.current.condition.icon 
                    : data.current.condition.icon
            }]
        };
    }

    showLoading() {
        this.loadingOverlay.classList.add('active');
    }

    hideLoading() {
        this.loadingOverlay.classList.remove('active');
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            <p>${message}</p>
        `;

        const container = document.querySelector('.preferences-section');
        const existingError = container.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }
        container.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 5000);
    }

    
}




document.addEventListener('DOMContentLoaded', () => {
    window.styleAI = new StyleAI();
});