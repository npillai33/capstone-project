#!/usr/bin/env python
import os, random, json
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, redirect, url_for, flash, current_app
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from flask_socketio import SocketIO, emit, join_room
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

# Initialize Flask app and configuration
app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///garden.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = 'static/Images/plants'

# Initialize extensions
db = SQLAlchemy(app)
migrate = Migrate(app, db)
login_manager = LoginManager(app)
login_manager.login_view = 'login'
socketio = SocketIO(app)

# Helper Functions
def calculate_level(xp):
    return int(xp ** 0.5 / 5) + 1

def extract_keywords(content):
    words = content.split()
    keywords = [word.strip('.,!?:;"()').lower() for word in words if len(word.strip('.,!?:;"()')) > 3]
    return list(set(keywords))

def get_daily_prompt():
    today = datetime.utcnow().date()
    prompt = Prompt.query.filter_by(is_daily=True).filter(
        (Prompt.used_at == None) | (Prompt.used_at < today)
    ).first()
    if not prompt:
        prompts = [
            "What challenges did you overcome today?",
            "What new ideas or insights did you gain?",
            "How did you collaborate with others today?"
        ]
        prompt = Prompt(text=random.choice(prompts), is_daily=True)
        db.session.add(prompt)
        db.session.commit()
    prompt.used_at = datetime.utcnow()
    db.session.commit()
    return prompt

def award_badges(user):
    if user.streak >= 7 and not UserBadge.query.filter_by(user_id=user.id, badge_id=1).first():
        badge = Badge.query.get(1)
        if badge:
            user_badge = UserBadge(user_id=user.id, badge_id=badge.id)
            db.session.add(user_badge)
            socketio.emit('new_badge', {
                'userId': user.id,
                'badge_id': badge.id,
                'badge_name': badge.name
            }, room=f'user_{user.id}')
    db.session.commit()

def create_plant_for_reflection(user, reflection):
    word_count = len(reflection.content.split())
    if word_count < 50:
        plant_type = PlantType.query.filter_by(name='Sunflower').first()
    elif word_count < 200:
        plant_type = PlantType.query.filter_by(name='Knowledge Shrub').first()
    else:
        plant_type = PlantType.query.filter_by(name='Wisdom Tree').first()
    if plant_type:
        plant = UserPlant(
            user_id=user.id,
            plant_type_id=plant_type.id,
            current_stage=0,
            group_id=reflection.group_id
        )
        db.session.add(plant)
        db.session.commit()

        target_room = f'group_{reflection.group_id}' if reflection.group_id else f'user_{user.id}'
        socketio.emit('new_plant', {
            'user_id': user.id,
            'plant_id': plant.id,
            'plant_type': plant_type.name,
            'image': plant_type.stages.get(str(plant.current_stage))
        }, room=target_room)

        # Refresh personal garden
        socketio.emit('garden_update', {'userId': user.id}, room=f'user_{user.id}')

# Database Models
class User(UserMixin, db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128))
    avatar = db.Column(db.String(256), default='default.png')
    title = db.Column(db.String(80), default='Seedling')
    xp = db.Column(db.Integer, default=0)
    level = db.Column(db.Integer, default=1)
    streak = db.Column(db.Integer, default=0)
    last_active = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    display_mode = db.Column(db.String(30), default='named')
    pseudonym = db.Column(db.String(80))
    quote = db.Column(db.Text)
    pronouns = db.Column(db.String(50))
    reflections = db.relationship('Reflection', backref='author', lazy=True)
    badges = db.relationship('UserBadge', backref='user', lazy=True)
    plants = db.relationship('UserPlant', backref='owner', lazy=True)
    comments = db.relationship('Comment', backref='author', lazy=True)
    votes = db.relationship('Vote', backref='voter', lazy=True)
    groups = db.relationship('GroupMember', backref='member', lazy=True)
    goals = db.relationship('Goal', backref='creator', lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    def update_streak(self):
        today = datetime.utcnow().date()
        if self.last_active:
            last_active_date = self.last_active.date()
            if today - last_active_date == timedelta(days=1):
                self.streak += 1
            elif today > last_active_date + timedelta(days=1):
                self.streak = 1
        else:
            self.streak = 1
        self.last_active = datetime.utcnow()
        db.session.commit()

class Reflection(db.Model):
    __tablename__ = 'reflections'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    display_name = db.Column(db.String(80))
    is_anonymous = db.Column(db.Boolean, default=False)
    is_group = db.Column(db.Boolean, default=False)
    group_id = db.Column(db.Integer, db.ForeignKey('groups.id'))
    prompt_id = db.Column(db.Integer, db.ForeignKey('prompts.id'))
    keywords = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    comments = db.relationship('Comment', backref='reflection', lazy=True)
    votes = db.relationship('Vote', backref='reflection', lazy=True)
    tags = db.relationship('ReflectionTag', backref='reflection', lazy=True)
    goal = db.relationship('Goal', backref='reflection', uselist=False, lazy=True)

class Comment(db.Model):
    __tablename__ = 'comments'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    reflection_id = db.Column(db.Integer, db.ForeignKey('reflections.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_constructive = db.Column(db.Boolean, default=False)

class Vote(db.Model):
    __tablename__ = 'votes'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    reflection_id = db.Column(db.Integer, db.ForeignKey('reflections.id'), nullable=False)
    value = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class PlantType(db.Model):
    __tablename__ = 'plant_types'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    rarity = db.Column(db.String(30), default='common')
    stages = db.Column(db.JSON)
    xp_value = db.Column(db.Integer, default=10)
    unlock_condition = db.Column(db.String(200))

class UserPlant(db.Model):
    __tablename__ = 'user_plants'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    plant_type_id = db.Column(db.Integer, db.ForeignKey('plant_types.id'), nullable=False)
    current_stage = db.Column(db.Integer, default=0)
    planted_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_watered = db.Column(db.DateTime, default=datetime.utcnow)
    plant_type = db.relationship('PlantType')
    group_id = db.Column(db.Integer, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.plant_type.name,
            'stage': self.current_stage,
            'image': self.plant_type.stages.get(str(self.current_stage))
        }

class Badge(db.Model):
    __tablename__ = 'badges'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    description = db.Column(db.Text)
    icon = db.Column(db.String(120), nullable=False)
    criteria = db.Column(db.JSON)

class UserBadge(db.Model):
    __tablename__ = 'user_badges'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    badge_id = db.Column(db.Integer, db.ForeignKey('badges.id'), nullable=False)
    earned_at = db.Column(db.DateTime, default=datetime.utcnow)
    badge = db.relationship('Badge')

class Group(db.Model):
    __tablename__ = 'groups'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text)
    class_name = db.Column(db.String(120))
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    members = db.relationship('GroupMember', backref='group', lazy=True)
    reflections = db.relationship('Reflection', backref='group', lazy=True)
    goals = db.relationship('Goal', backref='group', lazy=True, foreign_keys='Goal.group_id')

    def get_garden_plants(self):
        try:
            return UserPlant.query.filter_by(group_id=self.id).all()
        except Exception as e:
            current_app.logger.error(f"Error fetching garden plants for group {self.id}: {e}")
            return []

    def to_dict(self):
        try:
            garden_plants = [plant.to_dict() for plant in self.get_garden_plants()]
        except Exception:
            garden_plants = []
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'class_name': self.class_name,
            'memberCount': len(self.members),
            'reflectionCount': len(self.reflections),
            'goalCount': len(self.goals),
            'gardenState': {'plants': garden_plants}
        }

class GroupMember(db.Model):
    __tablename__ = 'group_members'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    group_id = db.Column(db.Integer, db.ForeignKey('groups.id'), nullable=False)
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)
    role = db.Column(db.String(30), default='member')

class Goal(db.Model):
    __tablename__ = 'goals'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    type = db.Column(db.String(30), default='personal')
    status = db.Column(db.String(30), default='in_progress')
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    group_id = db.Column(db.Integer, db.ForeignKey('groups.id'))
    reflection_id = db.Column(db.Integer, db.ForeignKey('reflections.id'))
    due_date = db.Column(db.DateTime)
    progress = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'type': self.type,
            'status': self.status,
            'progress': self.progress,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'created_at': self.created_at.isoformat(),
            'group_id': self.group_id
        }

class Prompt(db.Model):
    __tablename__ = 'prompts'
    id = db.Column(db.Integer, primary_key=True)
    text = db.Column(db.Text, nullable=False)
    is_daily = db.Column(db.Boolean, default=False)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    used_at = db.Column(db.DateTime)
    reflections = db.relationship('Reflection', backref='prompt', lazy=True)

class ReflectionTag(db.Model):
    __tablename__ = 'reflection_tags'
    id = db.Column(db.Integer, primary_key=True)
    reflection_id = db.Column(db.Integer, db.ForeignKey('reflections.id'), nullable=False)
    tag = db.Column(db.String(50), nullable=False)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Authentication Routes
@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user = User.query.filter_by(username=username).first()
        if user and user.check_password(password):
            login_user(user)
            flash('Logged in successfully!', 'success')
            next_page = request.args.get('next')
            return redirect(next_page or url_for('dashboard'))
        flash('Invalid username or password', 'danger')
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    if request.method == 'POST':
        username = request.form.get('username')
        email = request.form.get('email')
        password = request.form.get('password')
        if User.query.filter((User.username == username) | (User.email == email)).first():
            flash('Username or email already exists', 'danger')
            return redirect(url_for('register'))
        new_user = User(username=username, email=email)
        new_user.set_password(password)
        db.session.add(new_user)
        db.session.commit()
        flash('Registration successful! Please log in.', 'success')
        return redirect(url_for('login'))
    return render_template('register.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    flash('You have been logged out.', 'info')
    return redirect(url_for('login'))

# Main Page Routes
@app.route('/')
def homepage():
    return render_template('homepage.html')

@app.route('/dashboard')
@login_required
def dashboard():
    current_user.update_streak()
    award_badges(current_user)
    return render_template('dashboard.html', user=current_user)

@app.route('/journal')
@login_required
def journal():
    prompt = get_daily_prompt()
    groups = Group.query.join(GroupMember).filter(GroupMember.user_id == current_user.id).all()
    return render_template('journal.html', prompt=prompt, groups=groups)

@app.route('/greenhouse')
@login_required
def greenhouse():
    groups = Group.query.join(GroupMember).filter(GroupMember.user_id == current_user.id).all()
    selected_group_id = request.args.get('group_id')
    selected_group = Group.query.get(selected_group_id) if selected_group_id else groups[0] if groups else None
    return render_template('greenhouse.html', groups=groups, selected_group=selected_group)

@app.route('/pathways')
@login_required
def pathways():
    return render_template('pathways.html')

@app.route('/profile')
@login_required
def profile():
    return render_template('profile.html', user=current_user)

# API Endpoints
@app.route('/api/profile', methods=['GET'])
@login_required
def get_profile():
    badges = [{'badge_name': ub.badge.name, 'icon': ub.badge.icon} for ub in current_user.badges]
    return jsonify({'badges': badges})

@app.route('/api/profile', methods=['PUT'])
@login_required
def update_profile():
    data = request.get_json()
    new_title = data.get('title')
    new_quote = data.get('quote')
    new_pronouns = data.get('pronouns')
    if new_title: current_user.title = new_title
    if new_quote: current_user.quote = new_quote
    if new_pronouns: current_user.pronouns = new_pronouns
    db.session.commit()
    return jsonify({"message": "Profile updated successfully!"})

@app.route('/api/reflections', methods=['POST'])
@login_required
def submit_reflection():
    data = request.get_json()
    content = data.get('content')
    display_mode = data.get('display_mode')
    pseudonym = data.get('pseudonym')
    tags = data.get('tags', [])
    group_id = data.get('group_id')

    if display_mode == 'anonymous':
        display_name = None
        is_anonymous = True
    elif display_mode == 'pseudonym' and pseudonym:
        display_name = pseudonym
        is_anonymous = False
    else:
        display_name = current_user.username
        is_anonymous = False

    reflection = Reflection(
        user_id=current_user.id,
        content=content,
        display_name=display_name,
        is_anonymous=is_anonymous,
        is_group=bool(group_id),
        group_id=group_id,
        keywords=extract_keywords(content)
    )
    db.session.add(reflection)
    db.session.commit()

    for tag in tags:
        db.session.add(ReflectionTag(reflection_id=reflection.id, tag=tag))
    create_plant_for_reflection(current_user, reflection)
    current_user.xp += 10
    current_user.level = calculate_level(current_user.xp)
    db.session.commit()

    # real-time updates
    if group_id:
        socketio.emit('new_group_reflection', {
            'reflection': {
                'id': reflection.id,
                'content': reflection.content,
                'display_name': reflection.display_name,
                'tags': [t.tag for t in reflection.tags],
                'created_at': reflection.created_at.isoformat()
            }
        }, room=f'group_{group_id}')
    else:
        socketio.emit('new_reflection', {
            'reflection': {
                'id': reflection.id,
                'content': reflection.content,
                'display_name': reflection.display_name,
                'tags': [t.tag for t in reflection.tags],
                'created_at': reflection.created_at.isoformat()
            }
        }, room=f'user_{current_user.id}')

    # update user stats + garden
    socketio.emit('user_state_update', {
        'streak': current_user.streak,
        'xp': current_user.xp,
        'level': current_user.level
    }, room=f'user_{current_user.id}')
    socketio.emit('garden_update', {'userId': current_user.id}, room=f'user_{current_user.id}')

    return jsonify({"reflection": {
        'id': reflection.id,
        'content': reflection.content,
        'display_name': reflection.display_name,
        'tags': [t.tag for t in reflection.tags],
        'created_at': reflection.created_at.isoformat()
    }})

@app.route('/api/recent-activity')
@login_required
def recent_activity():
    group_ids = [gm.group_id for gm in current_user.groups]
    reflections = Reflection.query.filter(
        (Reflection.user_id == current_user.id) |
        (Reflection.group_id.in_(group_ids))
    ).order_by(Reflection.created_at.desc()).limit(10).all()
    goals = Goal.query.filter(
        (Goal.created_by == current_user.id) |
        (Goal.group_id.in_(group_ids))
    ).order_by(Goal.created_at.desc()).limit(10).all()
    activities = []
    for refl in reflections:
        activities.append({
            "type": "reflection",
            "id": refl.id,
            "created_at": refl.created_at.isoformat(),
            "content": refl.content,
            "display_name": refl.display_name if refl.display_name else "Anonymous",
            "upvotes": sum(v.value for v in refl.votes) if refl.votes else 0,
            "comments": len(refl.comments)
        })
    for goal in goals:
        activities.append({
            "type": "goal",
            "id": goal.id,
            "created_at": goal.created_at.isoformat(),
            "goalName": goal.title,
            "progress": goal.progress,
            "status": goal.status
        })
    activities = sorted(activities, key=lambda x: x["created_at"], reverse=True)
    return jsonify(activities)

@app.route('/api/garden-state')
@login_required
def garden_state():
    plants = [plant.to_dict() for plant in current_user.plants if plant.group_id is None]
    badges = [
        {
            'badge_id': ub.badge_id,
            'badge_name': ub.badge.name,
            'icon': ub.badge.icon
        }
        for ub in current_user.badges
    ]
    return jsonify({
        'plants': plants,
        'xp': current_user.xp,
        'streak': current_user.streak,
        'badges': badges
    })

@app.route('/api/plants/<int:plant_id>/water', methods=['POST'])
@login_required
def water_plant(plant_id):
    plant = UserPlant.query.get_or_404(plant_id)
    if plant.user_id != current_user.id:
        return jsonify({"error": "Unauthorized"}), 403

    plant.current_stage += 1
    max_stage = max(int(k) for k in plant.plant_type.stages.keys())
    if plant.current_stage > max_stage:
        plant.current_stage = max_stage
    plant.last_watered = datetime.utcnow()
    db.session.commit()

    socketio.emit('garden_update', {'userId': plant.user_id}, room=f'user_{plant.user_id}')

    return jsonify({
        "plant_id": plant.id,
        "new_stage": plant.current_stage,
        "image": plant.plant_type.stages.get(str(plant.current_stage))
    })

@app.route('/api/groups', methods=['GET', 'POST'])
@login_required
def groups_api():
    if request.method == 'GET':
        groups = Group.query.join(GroupMember).filter(GroupMember.user_id == current_user.id).all()
        return jsonify([g.to_dict() for g in groups])
    else:
        data = request.get_json()
        group = Group(
            name=data.get("name"),
            description=data.get("description"),
            class_name=data.get("class_name"),
            created_by=current_user.id
        )
        db.session.add(group)
        db.session.commit()
        creator = GroupMember(user_id=current_user.id, group_id=group.id)
        db.session.add(creator)
        for member_id in data.get("members", []):
            if member_id != current_user.id:
                db.session.add(GroupMember(user_id=member_id, group_id=group.id))
        db.session.commit()
        socketio.emit('group_created', group.to_dict())
        return jsonify(group.to_dict()), 201

@app.route('/api/groups/<int:group_id>', methods=['GET'])
@login_required
def get_group(group_id):
    group = Group.query.get(group_id)
    if not group:
        return jsonify({"error": "Group not found"}), 404

    # to_dict includes name, description, counts, and shared gardenState
    return jsonify(group.to_dict())

@app.route('/api/groups/<int:group_id>/activity', methods=['GET'])
@login_required
def group_activity(group_id):
    reflections = Reflection.query.filter_by(group_id=group_id).order_by(Reflection.created_at.desc()).all()
    goals = Goal.query.filter_by(group_id=group_id).order_by(Goal.created_at.desc()).all()
    activities = []
    for refl in reflections:
        activities.append({
            "type": "reflection",
            "userName": refl.display_name or "Anonymous",
            "createdAt": refl.created_at.isoformat(),
            "content": refl.content,
        })
    for goal in goals:
        activities.append({
            "type": "goal",
            "userName": User.query.get(goal.created_by).username,
            "createdAt": goal.created_at.isoformat(),
            "goalName": goal.title,
            "progress": goal.progress,
            "status": goal.status
        })
    activities = sorted(activities, key=lambda x: x["createdAt"], reverse=True)
    return jsonify(activities)

@app.route('/api/goals', methods=['GET'])
@login_required
def get_goals():
    personal_goals = Goal.query.filter_by(created_by=current_user.id, type='personal').all()
    group_goals = Goal.query.join(GroupMember, Goal.group_id == GroupMember.group_id).filter(
        GroupMember.user_id == current_user.id, Goal.type == 'group').all()
    return jsonify({
        'personal': [g.to_dict() for g in personal_goals],
        'group': [g.to_dict() for g in group_goals]
    })

@app.route('/api/goals', methods=['POST'])
@login_required
def create_goal():
    data = request.get_json()
    new_goal = Goal(
        title=data.get("title"),
        description=data.get("description"),
        type=data.get("type", "personal"),
        created_by=current_user.id,
        group_id=data.get("group_id"),
        due_date=datetime.strptime(data.get("due_date"), "%Y-%m-%d") if data.get("due_date") else None
    )
    db.session.add(new_goal)
    db.session.commit()

    socketio.emit('goal_created', new_goal.to_dict(),
                  room=f'group_{new_goal.group_id}' if new_goal.group_id else f'user_{current_user.id}')

    if not new_goal.group_id:
        socketio.emit('user_state_update', {
            'streak': current_user.streak,
            'xp': current_user.xp,
            'level': current_user.level
        }, room=f'user_{current_user.id}')
        socketio.emit('garden_update', {'userId': current_user.id}, room=f'user_{current_user.id}')

    return jsonify({"goal": new_goal.to_dict()}), 201

@app.route('/api/goals/<int:goal_id>', methods=['PUT'])
@login_required
def update_goal(goal_id):
    data = request.get_json()
    goal = Goal.query.get_or_404(goal_id)
    if goal.created_by != current_user.id:
        return jsonify({"error": "Unauthorized"}), 403
    goal.title = data.get("title", goal.title)
    goal.description = data.get("description", goal.description)
    goal.progress = data.get("progress", goal.progress)
    if data.get("due_date"):
        goal.due_date = datetime.strptime(data["due_date"], "%Y-%m-%d")
    db.session.commit()
    socketio.emit('goal_updated', goal.to_dict(), room=f'user_{current_user.id}')
    return jsonify(goal.to_dict())

@app.route('/api/goals/<int:goal_id>', methods=['DELETE'])
@login_required
def delete_goal(goal_id):
    goal = Goal.query.get_or_404(goal_id)
    if goal.created_by != current_user.id:
        return jsonify({"error": "Unauthorized"}), 403
    db.session.delete(goal)
    db.session.commit()
    socketio.emit('goal_deleted', {'goal_id': goal_id}, room=f'user_{current_user.id}')
    return jsonify({"message": "Goal deleted successfully."})

@app.route('/api/goals/<int:goal_id>/complete', methods=['POST'])
@login_required
def complete_goal(goal_id):
    goal = Goal.query.get_or_404(goal_id)
    if goal.created_by != current_user.id:
        return jsonify({"error": "Unauthorized"}), 403
    goal.status = 'completed'
    goal.progress = 100
    db.session.commit()
    socketio.emit('goal_updated', goal.to_dict(), room=f'user_{current_user.id}')
    socketio.emit('garden_update', {'userId': current_user.id}, room=f'user_{current_user.id}')
    return jsonify(goal.to_dict())

@app.route('/api/users')
@login_required
def get_users():
    # returns all other users so you can invite them to groups
    users = User.query.filter(User.id != current_user.id).all()
    users_data = [{"id": u.id, "username": u.username} for u in users]
    return jsonify(users_data)

@app.route('/api/milestones')
@login_required
def get_milestones():
    milestones = [
        {
            'id': 1,
            'name': 'Data Collection Complete',
            'description': 'Unlocks new research tools and badges',
            'progress': 2,
            'total_tasks': 3,
            'completed': False,
            'icon': 'fa-seedling'
        },
        {
            'id': 2,
            'name': '5-Day Reflection Streak',
            'description': 'Earn the "Consistent Gardener" badge',
            'progress': current_user.streak,
            'total_tasks': 5,
            'completed': current_user.streak >= 5,
            'icon': 'fa-trophy'
        }
    ]
    return jsonify(milestones)

@app.route('/api/pathways')
@login_required
def get_pathways():
    user_goals = Goal.query.filter_by(created_by=current_user.id).all()
    return jsonify([{"id": g.id, "title": g.title, "description": g.description, "status": g.status, "type": g.type, "due_date": g.due_date.isoformat() if g.due_date else None} for g in user_goals])

# Socket.IO Event Handlers
@socketio.on('connect')
def handle_connect(auth):
    if current_user.is_authenticated:
        join_room(f'user_{current_user.id}')

@socketio.on('disconnect')
def handle_disconnect():
    pass

@socketio.on('join_group')
def handle_join_group(data):
    join_room(f'group_{data["group_id"]}')

@socketio.on('new_comment')
def handle_new_comment(data):
    comment = Comment(
        user_id=current_user.id,
        reflection_id=data['reflection_id'],
        content=data['content']
    )
    db.session.add(comment)
    db.session.commit()
    emit('new_comment', {
        'reflectionId': comment.reflection_id,
        'comment': {
            'author': current_user.username,
            'content': comment.content,
            'createdAt': comment.created_at.isoformat()
        }
    }, room=f'reflection_{comment.reflection_id}')

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    socketio.run(app, debug=True)
