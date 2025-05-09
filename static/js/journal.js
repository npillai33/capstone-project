document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    let currentTab = 'self';
    const tabs = document.querySelectorAll('.tab-button');
    const contents = document.querySelectorAll('.tab-content');
    const inputs = {
        self: document.querySelector('#self-tab .reflection-input'),
        group: document.querySelector('#group-tab .reflection-input')
    };
    const displaySelf = document.getElementById('display-mode-self');
    const pseudoSelf = document.getElementById('pseudonym-input-self');
    const displayGrp = document.getElementById('display-mode-group');
    const pseudoGrp = document.getElementById('pseudonym-input-group');
    const groupSel = document.getElementById('group-select');
    const feedSelf = document.querySelector('#self-tab .reflection-feed');
    const feedGrp = document.querySelector('#group-tab .reflection-feed');
    const tagInputSelf = document.getElementById('tag-input-self');
    const selectedTagsSelf = document.getElementById('selected-tags-self');
    const tagInputGroup = document.getElementById('tag-input-group');
    const selectedTagsGroup = document.getElementById('selected-tags-group');
    let selectedTags = new Set();

    // Tab switch
    tabs.forEach(btn => btn.addEventListener('click', () => {
        currentTab = btn.dataset.tab;
        tabs.forEach(x => x.classList.toggle('active', x === btn));
        contents.forEach(c => c.classList.toggle('active', c.id === `${currentTab}-tab`));
    }));

    // Pseudonym toggles
    displaySelf.addEventListener('change', () => {
        pseudoSelf.style.display = displaySelf.value === 'pseudonym' ? 'block' : 'none';
    });
    displayGrp.addEventListener('change', () => {
        pseudoGrp.style.display = displayGrp.value === 'pseudonym' ? 'block' : 'none';
    });

    // Tag-input for self reflections
    tagInputSelf.addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = tagInputSelf.value.trim();
            if (val && !selectedTags.has(val)) {
                selectedTags.add(val);
                const span = document.createElement('span');
                span.className = 'tag selected';
                span.textContent = val;
                span.dataset.tag = val;
                span.addEventListener('click', () => {
                    selectedTags.delete(val);
                    span.remove();
                });
                selectedTagsSelf.appendChild(span);
            }
            tagInputSelf.value = '';
        }
    });

    // Tag-input for group reflections
    tagInputGroup.addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = tagInputGroup.value.trim();
            if (val && !selectedTags.has(val)) {
                selectedTags.add(val);
                const span = document.createElement('span');
                span.className = 'tag selected';
                span.textContent = val;
                span.dataset.tag = val;
                span.addEventListener('click', () => {
                    selectedTags.delete(val);
                    span.remove();
                });
                selectedTagsGroup.appendChild(span);
            }
            tagInputGroup.value = '';
        }
    });

    // Load groups
    fetch('/api/groups')
        .then(r => r.json())
        .then(gs => {
            groupSel.innerHTML = gs.length
                ? `<option value="">-- Choose a Group --</option>` +
                gs.map(g => `<option value="${g.id}">${g.name}</option>`).join('')
                : '<option>No groups – create one!</option>';
        });

    // Submit reflections
    document.querySelectorAll('.submit-button')
        .forEach(btn => btn.addEventListener('click', submitReflection));

    function submitReflection() {
        const content = inputs[currentTab].value.trim();
        if (!content) return alert('Write something!');
        const payload = {
            content,
            display_mode: currentTab === 'self' ? displaySelf.value : displayGrp.value,
            pseudonym: currentTab === 'self'
                ? (displaySelf.value === 'pseudonym' ? pseudoSelf.value.trim() : null)
                : (displayGrp.value === 'pseudonym' ? pseudoGrp.value.trim() : null),
            tags: [...selectedTags],
            group_id: currentTab === 'group' ? groupSel.value : null
        };
        fetch('/api/reflections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(r => r.json())
            .then(res => {
                addToFeed(res.reflection);
                inputs.self.value = '';
                inputs.group.value = '';
                selectedTags.clear();
                selectedTagsSelf.innerHTML = '';
                selectedTagsGroup.innerHTML = '';
            })
            .catch(console.error);
    }

    function addToFeed(r) {
        const container = currentTab === 'self' ? feedSelf : feedGrp;
        if (container.querySelector(`[data-id="ref-${r.id}"]`)) return;
        const card = document.createElement('div');
        card.dataset.id = `ref-${r.id}`;
        card.className = 'reflection-card animate-feed';
        card.innerHTML = `
            <div class="reflection-header">
                <span>${r.display_name || 'Anonymous'}</span>
                <span>${new Date(r.created_at).toLocaleString()}</span>
            </div>
            <div class="reflection-content"><p>${r.content}</p></div>
            <div class="comment-section">
                <textarea class="comment-input" placeholder="Add a comment…"></textarea>
                <button class="comment-submit" data-id="${r.id}">Comment</button>
                <div class="comments-list"></div>
            </div>
        `;
        container.prepend(card);
        setTimeout(() => card.classList.remove('animate-feed'), 400);
    }

    socket.on('new_reflection', data => {
        const isGroup = Boolean(data.reflection.group_id);
        if ((!isGroup && currentTab === 'self') ||
            (isGroup && currentTab === 'group' && groupSel.value === String(data.reflection.group_id))) {
            addToFeed(data.reflection);
        }
    });

    document.addEventListener('click', ev => {
        if (!ev.target.matches('.comment-submit')) return;
        const id = ev.target.dataset.id;
        const input = ev.target.previousElementSibling;
        const content = input.value.trim();
        if (!content) return alert('Write a comment!');
        fetch(`/api/reflections/${id}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        })
            .then(r => r.json())
            .then(data => {
                const list = ev.target.nextElementSibling;
                const div = document.createElement('div');
                div.textContent = `${data.comment.author}: ${data.comment.content}`;
                list.appendChild(div);
                input.value = '';
            })
            .catch(console.error);
    });

    fetch('/api/recent-activity')
        .then(r => r.json())
        .then(acts => {
            acts.filter(a => a.type === 'reflection' && !a.group_id)
                .forEach(a => addToFeed(a));
        });
});
