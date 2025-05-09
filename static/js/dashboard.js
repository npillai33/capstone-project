class DashboardSystem {
    constructor() {
        this.socket = io();
        this.initElements();
        this.setupEventListeners();
        this.loadGardenState();
        // Only call if the element exists
        this.updateWeatherTheme();
        setInterval(() => this.updateWeatherTheme(), 3600000);
    }

    initElements() {
        this.gardenContainer = document.getElementById('main-garden');
        this.xpBar = document.querySelector('.xp-progress');
        this.streakDisplay = document.querySelector('.status-item:nth-child(1) span');
        this.plantsDisplay = document.querySelector('.status-item:nth-child(2) span');
        this.badgesDisplay = document.querySelector('.status-item:nth-child(3) span');
        this.activityFeed = document.querySelector('.activity-list');
        this.reflectBtn = document.querySelector('.reflect-button');
        this.goalsBtn = document.querySelector('.goals-button');
        this.greenhouseBtn = document.querySelector('.greenhouse-button');
    }

    setupEventListeners() {
        this.reflectBtn.addEventListener('click', () => {
            window.location.href = this.reflectBtn.dataset.href;
        });
        this.goalsBtn.addEventListener('click', () => {
            window.location.href = this.goalsBtn.dataset.href;
        });
        this.greenhouseBtn.addEventListener('click', () => {
            window.location.href = this.greenhouseBtn.dataset.href;
        });

        this.socket.on('garden_update', data => {
            if (data.userId === currentUserId) this.loadGardenState();
        });

        this.socket.on('user_state_update', st => {
            this.streakDisplay.textContent = `${st.streak} Day Streak`;
            this.xpBar.style.width = `${st.xp % 100}%`;
        });

        this.socket.on('new_badge', data => {
            if (data.userId === currentUserId) {
                this.showBadgeNotification(data.badge_name);
                this.loadGardenState();
            }
        });

        this.socket.on('goal_created', g => {
            if (!g.group_id && g.created_by === currentUserId) {
                this.showGoalSprout();
                this.loadGardenState();
            }
        });
    }

    async loadGardenState() {
        try {
            const response = await fetch('/api/garden-state');
            const state = await response.json();
            this.renderGarden(state);
            this.updateStats(state);
            this.loadRecentActivity();
        } catch (error) {
            console.error('Error loading garden state:', error);
        }
    }

    renderGarden(state) {
        this.gardenContainer.innerHTML = '';
        const growth = Math.min(state.xp / 1000, 1);
        const tree = document.createElement('div');
        tree.className = 'tree-of-insight';
        tree.style.height = `${200 + growth * 300}px`;
        tree.innerHTML = `
      <div class="tree-trunk"></div>
      <div class="tree-canopy" style="opacity:${growth}"></div>
    `;
        this.gardenContainer.appendChild(tree);

        state.plants.forEach(p => {
            const el = document.createElement('div');
            el.className = 'garden-plant';
            el.style.backgroundImage = `url(${p.image})`;
            el.style.left = `${Math.random() * 80 + 10}%`;
            el.style.bottom = `${Math.random() * 30 + 10}%`;
            this.gardenContainer.appendChild(el);
        });
    }

    updateStats(state) {
        this.streakDisplay.textContent = `${state.streak} Day Streak`;
        this.plantsDisplay.textContent = `${state.plants.length} Plants`;
        this.badgesDisplay.textContent = `${state.badges.length} Badges`;
    }

    async loadRecentActivity() {
        try {
            const response = await fetch('/api/recent-activity');
            const acts = await response.json();
            this.renderActivities(acts);
        } catch (error) {
            console.error('Error loading recent activity:', error);
        }
    }

    renderActivities(acts) {
        this.activityFeed.innerHTML = '';
        acts.forEach(a => {
            const item = document.createElement('div');
            item.className = 'activity-item';
            let icon, text;
            if (a.type === 'reflection') {
                icon = 'book';
                text = a.content;
            } else {
                icon = 'seedling';
                text = `Completed goal "${a.goalName}"`;
            }
            item.innerHTML = `
        <i class="fas fa-${icon} activity-icon"></i>
        <div class="activity-content">
          <p>${text}</p>
          <small>${new Date(a.created_at).toLocaleString()}</small>
        </div>
      `;
            this.activityFeed.appendChild(item);
        });
    }

    updateWeatherTheme() {
        const weatherDisplay = document.getElementById('weather-theme');
        if (!weatherDisplay) return;  // <<— prevents null.querySelector
        const now = new Date();
        const hour = now.getHours();
        const weatherIcon = weatherDisplay.querySelector('.weather-icon');
        const weatherText = weatherDisplay.querySelector('.weather-text');
        let theme, icon, color;
        if (hour >= 6 && hour < 12) {
            theme = "Morning Garden"; icon = "sunrise"; color = "#FFD700";
        } else if (hour < 18) {
            theme = "Sunny Garden"; icon = "sun"; color = "#FFA500";
        } else if (hour < 22) {
            theme = "Evening Garden"; icon = "cloud-sun"; color = "#FF6347";
        } else {
            theme = "Moonlit Garden"; icon = "moon"; color = "#4169E1";
        }
        weatherIcon.className = `fas fa-${icon} weather-icon`;
        weatherText.textContent = theme;
        document.documentElement.style.setProperty('--highlight', color);
    }

    showBadgeNotification(name) {
        const notif = document.createElement('div');
        notif.className = 'badge-notification';
        notif.innerHTML = `<i class="fas fa-medal"></i> New badge: ${name}!`;
        document.body.appendChild(notif);
        setTimeout(() => notif.remove(), 4000);
    }

    showGoalSprout() {
        const f = document.createElement('div');
        f.className = 'garden-flower grow-animation';
        f.style.backgroundImage = `url('/static/Images/plants/flower_stage0.png')`;
        f.style.left = `${Math.random() * 80 + 10}%`;
        f.style.bottom = `${Math.random() * 30 + 10}%`;
        this.gardenContainer.appendChild(f);
        setTimeout(() => f.classList.remove('grow-animation'), 600);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.currentUserId = Number(document.body.dataset.currentUserId);
    new DashboardSystem();
});
