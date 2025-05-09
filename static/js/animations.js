// animations.js
class AnimationManager {
    constructor(socket) {
        this.socket = socket;
        this.initSocketListeners();
        this.initDOMEvents();
    }

    initSocketListeners() {
        this.socket.on('new_reflection', d => this.animateNewReflection(d.reflection));
        this.socket.on('new_group_reflection', d => this.animateNewReflection(d.reflection));
        this.socket.on('new_plant', pd => this.animatePlant(pd));
        this.socket.on('goal_created', gd => this.animateGoal(gd));
    }

    initDOMEvents() {
        document.addEventListener('reflection:submitted', ev =>
            this.animateNewReflection(ev.detail)
        );
        document.addEventListener('goal:submitted', ev =>
            this.animateGoal(ev.detail)
        );
    }

    animateNewReflection(ref) {
        // slide-up + fade-in the new card
        const sel = ref.group_id ? '#activity-feed' : '.reflection-feed';
        const feed = document.querySelector(sel);
        if (!feed) return;
        const card = feed.querySelector(`[data-id="ref-${ref.id}"]`) || this.createReflectionCard(ref, feed);
        card.classList.add('slide-up-fade-in');
        card.addEventListener('animationend', () => card.classList.remove('slide-up-fade-in'), { once: true });
    }

    animatePlant(pd) {
        // pulse the new plant icon
        const el = document.querySelector(`#plant-${pd.plant_id}`);
        if (!el) return;
        el.classList.add('grow-pulse');
        el.addEventListener('animationend', () => el.classList.remove('grow-pulse'), { once: true });
    }

    animateGoal(gd) {
        // for personal: sprout appears; group: celebratory bloom
        const container = document.getElementById(gd.group_id ? 'shared-garden' : 'main-garden');
        if (!container) return;
        const el = document.createElement('div');
        if (gd.group_id) {
            el.className = 'garden-flower celebrate';
            el.style.backgroundImage = `url('/static/Images/plants/flower_group.png')`;
        } else {
            el.className = 'sprout-appear';
            el.style.backgroundImage = `url('/static/Images/plants/sprout.jpg')`;
        }
        el.style.left = `${Math.random() * 80 + 10}%`;
        el.style.bottom = `${Math.random() * 30 + 10}%`;
        container.appendChild(el);
        setTimeout(() => el.remove(), 1200);
    }

    createReflectionCard(ref, feed) {
        const card = document.createElement('div');
        card.dataset.id = `ref-${ref.id}`;
        card.className = 'reflection-card';
        card.innerHTML = `
      <div class="reflection-header">
        <span>${ref.display_name || 'Anonymous'}</span>
        <span>${new Date(ref.created_at).toLocaleString()}</span>
      </div>
      <div class="reflection-content"><p>${ref.content}</p></div>
    `;
        feed.prepend(card);
        return card;
    }
}

// Auto‑init on every page:
document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // hook into local events:
    document.querySelectorAll('.submit-button').forEach(btn => {
        btn.addEventListener('click', () => {
            setTimeout(() => {
                const last = document.querySelector('.reflection-feed .reflection-card');
                if (last) document.dispatchEvent(new CustomEvent('reflection:submitted', {
                    detail: {
                        id: last.dataset.id.split('-')[1],
                        content: last.querySelector('p').textContent,
                        display_name: last.querySelector('.reflection-header span').textContent,
                        created_at: new Date().toISOString(),
                        group_id: btn.closest('#group-tab') ? last.dataset.groupId : null
                    }
                }));
            }, 200);
        });
    });

    document.querySelectorAll('.save-goal-button').forEach(btn => {
        btn.addEventListener('click', () => {
            // after goal POST returns, dispatch custom event
            setTimeout(() => {
                // need to pull data from your PathwaysSystem; adapt as needed
                const newNode = document.querySelector('#goal-path .bloom:last-child');
                if (newNode) document.dispatchEvent(new CustomEvent('goal:submitted', {
                    detail: {
                        id: newNode.dataset.goalId,
                        title: newNode.textContent,
                        group_id: document.getElementById('group-goal-select')?.value || null
                    }
                }));
            }, 300);
        });
    });

    new AnimationManager(socket);
});