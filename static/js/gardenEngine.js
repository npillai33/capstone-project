// static/js/gardenEngine.js
class GardenEngine {
    constructor(userId, containerId) {
        this.userId = userId;
        this.container = document.getElementById(containerId);
        this.plants = [];
        this.socket = io();
        this.initSocket();
        this.loadGarden();
        this.setupWeatherEffects();
    }

    async loadGarden() {
        try {
            const r = await fetch('/api/garden-state');
            const state = await r.json();
            this.renderGarden(state);
        } catch (e) {
            console.error('Error loading garden:', e);
        }
    }

    renderGarden(state) {
        this.container.innerHTML = '';

        // Add ambient particles
        this.createAmbientParticles();

        // Tree of insight
        const growth = Math.min(state.xp / 1000, 1);
        const tree = document.createElement('div');
        tree.className = 'tree-of-insight';
        tree.style.height = `${200 + growth * 300}px`;
        tree.innerHTML = `
            <div class="tree-trunk"></div>
            <div class="tree-canopy" style="opacity:${growth}"></div>
        `;
        this.container.appendChild(tree);

        // Plants
        state.plants.forEach(p => {
            const plant = this.createPlant(p);
            this.plants.push(plant);
            this.container.appendChild(plant.element);
            this.addPlantShadow(plant.element);
        });

        // Existing personal goals → flowers
        state.goals?.personal?.forEach(g => this.createFlower(g));

        // Rare badges → floating flowers
        state.badges?.forEach(b => {
            if (/rare|milestone|consistent/i.test(b.name)) {
                const f = this.createRareFlower(b);
                this.container.appendChild(f);
                this.addFlowerParticles(f);
            }
        });
    }

    createAmbientParticles() {
        const particles = document.createElement('div');
        particles.className = 'ambient-particles';
        this.container.appendChild(particles);

        for (let i = 0; i < 20; i++) {
            const particle = document.createElement('div');
            particle.className = 'ambient-particle';
            particle.style.left = `${Math.random() * 100}%`;
            particle.style.top = `${Math.random() * 100}%`;
            particle.style.animationDelay = `${Math.random() * 5}s`;
            particles.appendChild(particle);
        }
    }

    addPlantShadow(element) {
        const shadow = document.createElement('div');
        shadow.className = 'plant-shadow';
        element.appendChild(shadow);
    }

    addFlowerParticles(element) {
        const particles = document.createElement('div');
        particles.className = 'flower-particles';
        element.appendChild(particles);

        for (let i = 0; i < 5; i++) {
            const particle = document.createElement('div');
            particle.className = 'flower-particle';
            particle.style.animationDelay = `${Math.random() * 2}s`;
            particles.appendChild(particle);
        }
    }

    createPlant(plantData) {
        const element = document.createElement('div');
        element.className = 'garden-plant';
        element.style.backgroundImage = `url(${plantData.image})`;
        element.style.left = `${Math.random() * 80 + 10}%`;
        element.style.bottom = `${Math.random() * 30 + 10}%`;

        // Add growth stage indicator
        const growthIndicator = document.createElement('div');
        growthIndicator.className = 'growth-indicator';
        element.appendChild(growthIndicator);

        return {
            id: plantData.id,
            element,
            stage: plantData.stage
        };
    }

    createFlower(goalData) {
        const flower = document.createElement('div');
        flower.className = 'garden-flower';
        flower.style.backgroundImage = `url(${goalData.image || '/static/Images/plants/flower1.png'})`;
        flower.style.left = `${Math.random() * 80 + 10}%`;
        flower.style.bottom = `${Math.random() * 30 + 10}%`;

        setTimeout(() => {
            flower.classList.add('grow-animation');
        }, 100);

        return flower;
    }

    createRareFlower(badgeData) {
        const flower = document.createElement('div');
        flower.className = 'rare-flower';
        flower.style.backgroundImage = `url(${badgeData.icon || '/static/Images/plants/rare1.png'})`;
        flower.style.left = `${Math.random() * 80 + 10}%`;
        flower.style.bottom = `${Math.random() * 30 + 10}%`;
        return flower;
    }

    setupWeatherEffects() {
        // Simulate weather changes
        const weatherStates = ['sunny', 'cloudy', 'rainy'];
        let currentWeather = 'sunny';

        setInterval(() => {
            const newWeather = weatherStates[Math.floor(Math.random() * weatherStates.length)];
            if (newWeather !== currentWeather) {
                this.updateWeather(newWeather);
                currentWeather = newWeather;
            }
        }, 30000); // Change weather every 30 seconds
    }

    updateWeather(weather) {
        this.container.className = `garden-container weather-${weather}`;

        // Add weather-specific effects
        if (weather === 'rainy') {
            this.createRainEffect();
        } else if (weather === 'sunny') {
            this.createSunshineEffect();
        }
    }

    createRainEffect() {
        const rain = document.createElement('div');
        rain.className = 'rain-effect';
        this.container.appendChild(rain);

        for (let i = 0; i < 50; i++) {
            const drop = document.createElement('div');
            drop.className = 'rain-drop';
            drop.style.left = `${Math.random() * 100}%`;
            drop.style.animationDelay = `${Math.random() * 2}s`;
            rain.appendChild(drop);
        }
    }

    createSunshineEffect() {
        const sunshine = document.createElement('div');
        sunshine.className = 'sunshine-effect';
        this.container.appendChild(sunshine);

        for (let i = 0; i < 10; i++) {
            const ray = document.createElement('div');
            ray.className = 'sun-ray';
            ray.style.transform = `rotate(${i * 36}deg)`;
            ray.style.animationDelay = `${Math.random() * 2}s`;
            sunshine.appendChild(ray);
        }
    }

    async water(id) {
        try {
            const res = await fetch(`/api/plants/${id}/water`, { method: 'POST' });
            if (!res.ok) throw new Error('Water failed');
            const { new_stage, image } = await res.json();
            const pl = this.plants.find(x => x.id === id);
            pl.stage = new_stage;
            pl.element.style.backgroundImage = `url(${image})`;
            pl.element.classList.add('growing');

            // Add water splash effect
            this.createWaterSplash(pl.element);

            setTimeout(() => {
                pl.element.classList.remove('growing');
            }, 1000);
        } catch (e) {
            console.error(e);
        }
    }

    createWaterSplash(element) {
        const splash = document.createElement('div');
        splash.className = 'water-splash';
        element.appendChild(splash);

        setTimeout(() => {
            splash.remove();
        }, 1000);
    }

    initSocket() {
        this.socket.on('garden_update', d => {
            if (d.userId === this.userId) this.loadGarden();
        });

        this.socket.on('new_plant', pd => {
            if (pd.user_id === this.userId) {
                const pl = this.createPlant({
                    id: pd.plant_id,
                    stage: 0,
                    image: pd.image
                });
                this.plants.push(pl);
                this.container.appendChild(pl.element);
                pl.element.classList.add('celebrate');
                setTimeout(() => pl.element.classList.remove('celebrate'), 1500);
            }
        });

        this.socket.on('goal_created', gd => {
            if (!gd.group_id && gd.created_by === this.userId) {
                const flower = this.createFlower(gd);
                this.container.appendChild(flower);
            }
        });

        this.socket.on('user_state_update', st => {
            document.querySelector('.status-item:nth-child(1) span')
                .textContent = `${st.streak} Day Streak`;
            document.querySelector('.status-item:nth-child(2) span')
                .textContent = `${st.xp} XP`;
            document.querySelector('.status-item:nth-child(3) span')
                .textContent = `Lvl ${st.level}`;
        });

        this.socket.on('new_badge', bd => {
            if (bd.userId === this.userId) {
                this.showBadgeNotification(bd.badge_name);
                const flower = this.createRareFlower(bd);
                this.container.appendChild(flower);
            }
        });
    }

    showBadgeNotification(badgeName) {
        const notification = document.createElement('div');
        notification.className = 'badge-notification';
        notification.innerHTML = `
            <i class="fas fa-medal"></i>
            <span>New Badge: ${badgeName}</span>
        `;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 4000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new GardenEngine(currentUserId, 'main-garden');
});