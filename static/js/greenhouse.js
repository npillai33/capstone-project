// static/js/greenhouse.js
document.addEventListener('DOMContentLoaded', () => {
    class GreenhouseSystem {
        constructor() {
            this.socket = io();
            this.currentGroupId = null;
            this.initElements();
            this.setupEventListeners();
            this.loadGroups();
        }

        initElements() {
            this.groupList = document.getElementById('group-list');
            this.groupCount = document.getElementById('group-count');
            this.header = document.getElementById('group-header');
            this.shared = document.getElementById('shared-garden');
            this.feed = document.getElementById('activity-feed');
            this.createBtn = document.querySelector('.create-group-button');
            this.modal = document.getElementById('group-modal');
            this.form = document.getElementById('group-form');
            this.cancel = document.getElementById('cancel-group-button');
            this.classDD = document.getElementById('class-name');
            this.members = document.getElementById('member-list');
        }

        setupEventListeners() {
            this.groupList.addEventListener('click', e => {
                const it = e.target.closest('.group-item');
                if (it) this.selectGroup(it.dataset.groupId);
            });

            this.createBtn.addEventListener('click', () => this.openModal());
            this.cancel.addEventListener('click', () => this.closeModal());
            this.form.addEventListener('submit', e => {
                e.preventDefault();
                this.createGroup();
            });
            this.classDD?.addEventListener('change', e => this.loadMembers(e.target.value));

            this.socket.on('group_created', () => this.loadGroups());
            this.socket.on('new_group_reflection', () => {
                if (this.currentGroupId) this.loadActivity(this.currentGroupId);
            });
            this.socket.on('new_comment', () => {
                if (this.currentGroupId) this.loadActivity(this.currentGroupId);
            });

            // ← NEW: group goal
            this.socket.on('goal_created', g => {
                if (String(g.group_id) === String(this.currentGroupId)) {
                    this.dropFlower(g);
                    this.loadActivity(this.currentGroupId);
                }
            });
        }

        async loadGroups() {
            const r = await fetch('/api/groups');
            this.groups = await r.json();
            this.renderList();
            this.groupCount.textContent = `${this.groups.length} Group${this.groups.length !== 1 ? 's' : ''}`;
            if (this.groups.length && !this.currentGroupId) {
                this.selectGroup(this.groups[0].id);
            }
        }

        renderList() {
            this.groupList.innerHTML = '';
            this.groups.forEach(g => {
                const d = document.createElement('div');
                d.className = 'group-item';
                d.dataset.groupId = g.id;
                if (String(g.id) === String(this.currentGroupId)) d.classList.add('active');
                d.innerHTML = `<i class="fas fa-users"></i> ${g.name} <small>${g.memberCount}</small>`;
                this.groupList.appendChild(d);
            });
        }

        async selectGroup(id) {
            this.currentGroupId = id;
            this.renderList();
            await this.loadDetails(id);
            await this.loadActivity(id);
            this.socket.emit('join_group', { group_id: id });
        }

        async loadDetails(id) {
            const r = await fetch(`/api/groups/${id}`);
            const g = await r.json();
            this.header.innerHTML = `
        <h2>${g.name}</h2><p>${g.description || ''}</p>
        <div><i class="fas fa-seedling"></i>${g.reflectionCount} Refl</div>
        <div><i class="fas fa-bullseye"></i>${g.goalCount} Goals</div>
      `;
            this.renderShared(g.gardenState);
        }

        renderShared(gs) {
            this.shared.innerHTML = '';
            if (gs.plants.length) {
                gs.plants.forEach(p => {
                    const el = document.createElement('div');
                    el.className = 'garden-plant';
                    el.style.backgroundImage = `url(${p.image})`;
                    this.shared.appendChild(el);
                });
            } else {
                this.shared.innerHTML = '<p>No shared garden yet.</p>';
            }
        }

        dropFlower(g) {
            const f = document.createElement('div');
            f.className = 'garden-flower grow-animation';
            f.style.backgroundImage = `url('/static/Images/plants/flower_group.png')`;
            f.style.left = `${Math.random() * 80 + 10}%`;
            f.style.bottom = `${Math.random() * 30 + 10}%`;
            this.shared.appendChild(f);
            setTimeout(() => f.classList.remove('grow-animation'), 600);
        }

        async loadActivity(id) {
            const r = await fetch(`/api/groups/${id}/activity`);
            const acts = await r.json();
            this.feed.innerHTML = '';
            if (!acts.length) {
                this.feed.innerHTML = '<p>No recent activity</p>';
                return;
            }
            acts.forEach(a => {
                const d = document.createElement('div');
                d.className = `activity-item ${a.type}`;
                if (a.type === 'reflection') {
                    d.innerHTML = `<strong>${a.userName}</strong>
            <time>${new Date(a.createdAt).toLocaleString()}</time>
            <p>${a.content}</p>`;
                } else {
                    d.innerHTML = `<strong>${a.userName}</strong>
            <time>${new Date(a.createdAt).toLocaleString()}</time>
            <p>Goal "${a.goalName}" ${a.progress}% (${a.status})</p>`;
                }
                this.feed.prepend(d);
            });
        }

        async loadMembers(cls) {
            let users = await (await fetch('/api/users')).json();
            users = users.filter(u => u.id !== currentUserId);
            this.members.innerHTML = '';
            users.forEach(u => {
                const dd = document.createElement('div');
                dd.innerHTML = `
          <input type="checkbox" id="m${u.id}" value="${u.id}">
          <label for="m${u.id}">${u.username}</label>`;
                this.members.appendChild(dd);
            });
        }

        async createGroup() {
            const nm = document.getElementById('group-name').value;
            const cls = this.classDD.value;
            const mems = [...this.members.querySelectorAll('input:checked')].map(i => i.value);
            if (!nm || !cls) return alert('Name+Class required');
            const r = await fetch('/api/groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: nm, description: document.getElementById('group-description').value, class_name: cls, members: mems })
            });
            if (!r.ok) {
                const err = await r.json();
                return alert(err.error || 'fail');
            }
            this.loadGroups();
            this.closeModal();
        }

        openModal() { this.modal.style.display = 'flex'; }
        closeModal() {
            this.modal.style.display = 'none';
            this.form.reset();
            this.members.innerHTML = '';
        }
    }

    new GreenhouseSystem();
});
