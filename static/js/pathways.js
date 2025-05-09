document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    class PathwaysSystem {
        constructor() {
            this.goals = [];
            this.loadGoals();
            this.setupEventListeners();
            this.setupTypeToggle();
        }

        setupEventListeners() {
            document.querySelector('.add-goal-button')
                .addEventListener('click', () => this.openGoalModal());
            document.querySelector('.cancel-goal-button')
                .addEventListener('click', () => this.closeGoalModal());
            document.getElementById('goal-form')
                .addEventListener('submit', e => { e.preventDefault(); this.saveGoal(); });

            socket.on('goal_created', gd => {
                if (this.goals.find(g => g.id === gd.id)) return;
                this.goals.push(gd);
                this.renderGoalList();
                this.renderGoalPath();
                this.calculateMilestones();
                const newNode = document.querySelector(`.pathway-node[data-goal-id="${gd.id}"]`);
                if (newNode) {
                    newNode.classList.add('bloom');
                    setTimeout(() => newNode.classList.remove('bloom'), 800);
                }
            });

            socket.on('goal_updated', gd => {
                this.goals = this.goals.map(g => g.id === gd.id ? gd : g);
                this.renderGoalList();
                this.renderGoalPath();
                this.calculateMilestones();
            });

            socket.on('goal_deleted', ({ goal_id }) => {
                this.goals = this.goals.filter(g => g.id !== goal_id);
                this.renderGoalList();
                this.renderGoalPath();
                this.calculateMilestones();
            });
        }

        setupTypeToggle() {
            const typeSel = document.getElementById('goal-type');
            const grpCont = document.getElementById('group-goal-container');
            const toggle = () => {
                grpCont.style.display = typeSel.value === 'group' ? 'block' : 'none';
            };
            typeSel.addEventListener('change', toggle);
            toggle();
        }

        async loadGoals() {
            const r = await fetch('/api/goals');
            const data = await r.json();
            this.goals = [...data.personal, ...data.group];
            this.renderGoalList();
            this.renderGoalPath();
            this.calculateMilestones();
        }

        renderGoalList() {
            const list = document.getElementById('goal-list');
            list.innerHTML = '';
            this.goals.forEach(goal => {
                const item = document.createElement('div');
                item.className = 'goal-item';
                item.dataset.goalId = goal.id;
                item.innerHTML = `
                    <div class="goal-info">
                        <div class="goal-progress-circle" data-progress="${goal.progress}">
                            <div class="goal-icon"><i class="fas fa-bullseye"></i></div>
                        </div>
                        <div class="goal-details">
                            <h4>${goal.title}</h4>
                            <p>${goal.description || ''}</p>
                            <small>Due: ${goal.due_date ? goal.due_date.substr(0, 10) : 'N/A'}</small>
                        </div>
                    </div>
                    <div class="goal-actions">
                        <button class="edit-goal">Edit</button>
                        <button class="delete-goal">Delete</button>
                        <button class="complete-goal">
                            ${goal.status === 'completed' ? 'Completed' : 'Mark Complete'}
                        </button>
                    </div>
                `;
                item.querySelector('.edit-goal')
                    .addEventListener('click', () => this.openGoalModal(goal));
                item.querySelector('.delete-goal')
                    .addEventListener('click', () => this.deleteGoal(goal.id));
                item.querySelector('.complete-goal')
                    .addEventListener('click', () => this.markGoalComplete(goal));
                list.appendChild(item);
            });
            this.renderCircularProgress();
        }

        renderCircularProgress() {
            document.querySelectorAll('.goal-progress-circle')
                .forEach(c => {
                    const p = Number(c.dataset.progress);
                    c.style.background = `conic-gradient(var(--golden) ${p * 3.6}deg, #ccc ${p * 3.6}deg)`;
                });
        }

        renderGoalPath() {
            const path = document.getElementById('goal-path');
            path.innerHTML = '';
            const total = this.goals.length;
            this.goals.forEach((g, i) => {
                const node = document.createElement('div');
                node.className = 'pathway-node';
                node.dataset.goalId = g.id;
                node.style.left = `${total > 1 ? (i / (total - 1) * 100) : 50}%`;
                if (g.type === 'personal') {
                    node.innerHTML = `<img src="/static/Images/plants/sprout.jpg" class="sprout-image">`;
                } else {
                    node.innerHTML = `<span class="branch-label">${g.title}</span>`;
                }
                path.appendChild(node);
            });
        }

        calculateMilestones() {
            const ml = document.getElementById('milestone-list');
            ml.innerHTML = '';
            const count = Math.floor(this.goals.length / 5);
            for (let i = 1; i <= count; i++) {
                const m = document.createElement('div');
                m.className = 'milestone-item';
                m.innerHTML = `
                    <i class="fas fa-star"></i>
                    <div><h4>Milestone ${i}</h4><p>Completed ${i * 5} goals</p></div>
                `;
                ml.appendChild(m);
            }
        }

        openGoalModal(goal = null) {
            const md = document.getElementById('goal-modal');
            md.style.display = 'block';
            document.getElementById('modal-title').textContent = goal ? 'Edit Goal' : 'Add New Goal';
            document.getElementById('goal-title').value = goal ? goal.title : '';
            document.getElementById('goal-description').value = goal ? goal.description : '';
            document.getElementById('goal-type').value = goal ? goal.type : 'personal';
            document.getElementById('group-goal-select').value = goal && goal.group_id ? goal.group_id : '';
            document.getElementById('goal-deadline').value = goal && goal.due_date ? goal.due_date.substr(0, 10) : '';
            md.dataset.editId = goal ? goal.id : '';
            this.setupTypeToggle();
        }

        closeGoalModal() {
            const md = document.getElementById('goal-modal');
            md.style.display = 'none';
            delete md.dataset.editId;
            document.getElementById('goal-form').reset();
        }

        async saveGoal() {
            const md = document.getElementById('goal-modal');
            const id = md.dataset.editId;
            const payload = {
                title: document.getElementById('goal-title').value,
                description: document.getElementById('goal-description').value,
                type: document.getElementById('goal-type').value,
                group_id: document.getElementById('group-goal-select').value || null,
                due_date: document.getElementById('goal-deadline').value,
                progress: 0
            };
            let res, data;
            if (id) {
                res = await fetch(`/api/goals/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                data = await res.json();
                this.goals = this.goals.map(x => x.id === data.id ? data : x);
            } else {
                res = await fetch('/api/goals', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                data = await res.json();
                this.goals.push(data.goal);
            }
            this.renderGoalList();
            this.renderGoalPath();
            this.calculateMilestones();
            this.closeGoalModal();
        }

        async deleteGoal(id) {
            await fetch(`/api/goals/${id}`, { method: 'DELETE' });
            this.goals = this.goals.filter(x => x.id !== id);
            this.renderGoalList();
            this.renderGoalPath();
            this.calculateMilestones();
        }

        async markGoalComplete(goal) {
            goal.progress = 100;
            goal.status = 'completed';
            await fetch(`/api/goals/${goal.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(goal)
            });
            this.goals = this.goals.map(x => x.id === goal.id ? goal : x);
            this.renderGoalList();
            this.renderGoalPath();
            this.calculateMilestones();
        }
    }

    new PathwaysSystem();
});
