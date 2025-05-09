// homepage.js
document.addEventListener('DOMContentLoaded', () => {
    function updateWeatherTheme() {
        const weatherDisplay = document.getElementById('weather-theme');
        if (!weatherDisplay) return;
        const weatherIcon = weatherDisplay.querySelector('.weather-icon');
        const weatherText = weatherDisplay.querySelector('.weather-text');
        const now = new Date();
        const hour = now.getHours();
        let theme, icon, color;
        if (hour >= 6 && hour < 12) {
            theme = "Morning Garden";
            icon = "sunrise";
            color = "#FFD700";
        } else if (hour >= 12 && hour < 18) {
            theme = "Sunny Garden";
            icon = "sun";
            color = "#FFA500";
        } else if (hour >= 18 && hour < 22) {
            theme = "Evening Garden";
            icon = "cloud-sun";
            color = "#FF6347";
        } else {
            theme = "Moonlit Garden";
            icon = "moon";
            color = "#4169E1";
        }
        weatherIcon.className = `fas fa-${icon} weather-icon`;
        weatherText.textContent = theme;
        document.documentElement.style.setProperty('--highlight', color);
    }

    function animateGardenPreview() {
        const plants = document.querySelectorAll('.garden-preview .plant');
        const badge = document.querySelector('.badge-floating');
        plants.forEach((plant, index) => {
            if (plant) {
                plant.style.animationDelay = `${index * 0.5}s`;
                plant.addEventListener('mouseenter', () => {
                    plant.style.transform = 'scale(1.1) rotate(5deg)';
                });
                plant.addEventListener('mouseleave', () => {
                    plant.style.transform = 'scale(1) rotate(0)';
                });
            }
        });
        if (badge) {
            badge.style.animation = 'float 4s ease-in-out infinite';
        }
    }

    function setupCTASparkle() {
        const ctaButton = document.querySelector('.cta-button');
        const sparkle = document.querySelector('.sparkle-effect');
        if (ctaButton && sparkle) {
            ctaButton.addEventListener('mouseenter', () => {
                sparkle.style.opacity = '1';
                sparkle.style.transform = 'scale(1.5)';
                setTimeout(() => {
                    sparkle.style.opacity = '0';
                    sparkle.style.transform = 'scale(1)';
                }, 500);
            });
        }
    }

    updateWeatherTheme();
    animateGardenPreview();
    setupCTASparkle();
    setInterval(updateWeatherTheme, 3600000);
});
