document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    const tabBtns = document.querySelectorAll('.tab-button');
    const tabCts = document.querySelectorAll('.tab-content');
    const feed = document.querySelector('#reflections-tab .reflection-feed');
    const badgesGrid = document.querySelector('#badges-tab .badges-grid');
    const streakEl = document.querySelector('.profile-stats .stat-item:nth-child(1) span');
    const plantsEl = document.querySelector('.profile-stats .stat-item:nth-child(2) span');
    const badgesEl = document.querySelector('.profile-stats .stat-item:nth-child(3) span');

    tabBtns.forEach(b => b.addEventListener('click', () => {
        tabBtns.forEach(x => x.classList.remove('active'));
        tabCts.forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        document.getElementById(b.dataset.tab + '-tab').classList.add('active');
    }));

    fetch('/api/recent-activity')
        .then(r => r.json())
        .then(arr => {
            arr.filter(a => a.type === 'reflection')
                .forEach(r => addReflection(r));
        });

    fetch('/api/profile')
        .then(r => r.json())
        .then(u => {
            (u.badges || []).forEach(b => {
                const c = document.createElement('div');
                c.className = 'badge-card';
                c.innerHTML = `<i class="fas fa-medal"></i> ${b.badge_name}`;
                badgesGrid.appendChild(c);
            });
        });

    function addReflection(r) {
        const c = document.createElement('div');
        c.className = 'reflection-card';
        c.innerHTML = `
      <div class="reflection-header">
        <span>${r.display_name || 'Anonymous'}</span>
        <span>${new Date(r.created_at).toLocaleString()}</span>
      </div>
      <div class="reflection-content"><p>${r.content}</p></div>
    `;
        feed.prepend(c);
    }

    socket.on('new_reflection', d => addReflection(d.reflection));
    socket.on('new_badge', bd => {
        if (bd.userId === currentUserId) {
            const c = document.createElement('div');
            c.className = 'badge-card';
            c.innerHTML = `<i class="fas fa-medal"></i> ${bd.badge_name}`;
            badgesGrid.prepend(c);
        }
    });
    socket.on('user_state_update', st => {
        streakEl.textContent = `${st.streak} Day Streak`;
        plantsEl.textContent = `${st.xp} XP`;
        badgesEl.textContent = `Lvl ${st.level}`;
    });

    const saveBtn = document.querySelector('.save-button');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const pronouns = document.getElementById('pronouns-input').value;
            const title = document.getElementById('title-input').value;
            const quote = document.getElementById('quote-input').value;
            try {
                const res = await fetch('/api/profile', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pronouns, title, quote })
                });
                if (!res.ok) throw new Error('Save failed');
                alert('Profile saved!');
            } catch (e) {
                console.error(e);
                alert('Error saving profile.');
            }
        });
    }
});
