import os
from datetime import datetime, timedelta
from functools import wraps

import bcrypt
from flask import Flask, jsonify, request, send_from_directory, session
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func, select

app = Flask(__name__)
CORS(app)

app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "campuspulse-local-secret")
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = os.getenv("FLASK_ENV") == "production"
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv(
    "DATABASE_URL", "sqlite:///campuspulse.db"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(180), unique=True, nullable=False)
    password_hash = db.Column(db.LargeBinary, nullable=False)
    role = db.Column(db.String(20), nullable=False, default="Student")


class Resource(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    category = db.Column(db.String(50), nullable=False)
    location = db.Column(db.String(120), nullable=False)
    capacity = db.Column(db.Integer, nullable=False, default=1)


class Booking(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    resource_id = db.Column(db.Integer, db.ForeignKey("resource.id"), nullable=False)
    start_at = db.Column(db.DateTime, nullable=False)
    end_at = db.Column(db.DateTime, nullable=False)
    status = db.Column(db.String(20), nullable=False, default="Confirmed")
    verified_at = db.Column(db.DateTime)
    user = db.relationship("User")
    resource = db.relationship("Resource")


class LostItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    reporter_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    title = db.Column(db.String(120), nullable=False)
    category = db.Column(db.String(50), nullable=False)
    location = db.Column(db.String(120), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="Unclaimed")
    found_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    reporter = db.relationship("User")


class Claim(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    item_id = db.Column(db.Integer, db.ForeignKey("lost_item.id"), nullable=False)
    claimant_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    proof = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), nullable=False, default="Claim_Pending")
    item = db.relationship("LostItem")
    claimant = db.relationship("User")


def parse_datetime(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def current_user():
    user_id = session.get("user_id")
    return db.session.get(User, user_id) if user_id else None


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not current_user():
            return jsonify({"error": "Authentication required"}), 401
        return view(*args, **kwargs)
    return wrapped


def roles_required(*allowed_roles):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            user = current_user()
            if not user:
                return jsonify({"error": "Authentication required"}), 401
            if user.role not in allowed_roles:
                return jsonify({"error": "You are not authorized for this action"}), 403
            return view(*args, **kwargs)
        return wrapped
    return decorator


def seed_database():
    if Resource.query.first():
        return

    db.session.add_all([
        User(name="Demo Student", email="student@campuspulse.local", role="Student",
             password_hash=bcrypt.hashpw(b"password", bcrypt.gensalt())),
        User(name="Lab Assistant", email="assistant@campuspulse.local", role="Lab Assistant",
             password_hash=bcrypt.hashpw(b"password", bcrypt.gensalt())),
        User(name="Campus Admin", email="admin@campuspulse.local", role="Admin",
             password_hash=bcrypt.hashpw(b"password", bcrypt.gensalt())),
    ])
    db.session.flush()

    resources = [
        Resource(name="Dell OptiPlex 7080", category="PC", location="Lab A", capacity=1),
        Resource(name="Epson Projector", category="Projector", location="Lab B", capacity=1),
        Resource(name="Arduino Kit", category="Microcontroller", location="Lab C", capacity=4),
    ]
    db.session.add_all(resources)
    db.session.flush()

    student = User.query.filter_by(email="student@campuspulse.local").first()
    now = datetime.utcnow()
    db.session.add_all([
        Booking(user_id=student.id, resource_id=resources[0].id,
                start_at=now + timedelta(hours=2), end_at=now + timedelta(hours=3), status="Confirmed"),
        Booking(user_id=student.id, resource_id=resources[2].id,
                start_at=now + timedelta(days=1), end_at=now + timedelta(days=1, hours=1), status="Confirmed"),
        LostItem(reporter_id=student.id, title="Silver calculator", category="Calculator",
                 location="Lab B", status="Unclaimed"),
    ])
    db.session.commit()


with app.app_context():
    db.create_all()
    seed_database()


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "database": app.config["SQLALCHEMY_DATABASE_URI"]})


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    user = User.query.filter_by(email=data.get("email", "").strip().lower()).first()
    if not user or not bcrypt.checkpw(data.get("password", "").encode(), user.password_hash):
        return jsonify({"error": "Invalid email or password"}), 401
    session.clear()
    session["user_id"] = user.id
    session["role"] = user.role
    return jsonify({"id": user.id, "name": user.name, "email": user.email, "role": user.role})


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    if len(name) < 2 or "@" not in email or len(password) < 8:
        return jsonify({"error": "Provide a name, valid email and 8-character password"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email is already registered"}), 409
    user = User(name=name, email=email, role="Student",
                password_hash=bcrypt.hashpw(password.encode(), bcrypt.gensalt()))
    db.session.add(user)
    db.session.commit()
    session.clear()
    session["user_id"] = user.id
    session["role"] = user.role
    return jsonify({"id": user.id, "name": user.name, "email": user.email, "role": user.role}), 201


@app.get("/api/auth/me")
@login_required
def auth_me():
    user = current_user()
    return jsonify({"id": user.id, "name": user.name, "email": user.email, "role": user.role})


@app.post("/api/auth/logout")
@login_required
def logout():
    session.clear()
    return jsonify({"status": "logged out"})


@app.post("/api/auth/users")
@roles_required("Admin")
def provision_user():
    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    role = data.get("role")
    if role not in ("Student", "Lab Assistant", "Admin"):
        return jsonify({"error": "Invalid role"}), 400
    if len(name) < 2 or "@" not in email or len(password) < 8:
        return jsonify({"error": "Provide a name, valid email and 8-character password"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email is already registered"}), 409
    user = User(name=name, email=email, role=role,
                password_hash=bcrypt.hashpw(password.encode(), bcrypt.gensalt()))
    db.session.add(user)
    db.session.commit()
    return jsonify({"id": user.id, "name": user.name, "email": user.email, "role": user.role}), 201


@app.get("/api/resources")
@login_required
def resources():
    rows = Resource.query.all()
    return jsonify([{"id": r.id, "name": r.name, "category": r.category,
                     "location": r.location, "capacity": r.capacity} for r in rows])


@app.post("/api/bookings")
@roles_required("Student", "Lab Assistant", "Admin")
def create_booking():
    data = request.get_json(silent=True) or {}
    try:
        start_at = parse_datetime(data["start_at"])
        end_at = parse_datetime(data["end_at"])
        resource_id = int(data["resource_id"])
        user_id = current_user().id
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "Invalid booking data"}), 400

    if start_at >= end_at:
        return jsonify({"error": "End time must be after start time"}), 400

    overlap = db.session.query(Booking).filter(
        Booking.resource_id == resource_id,
        Booking.status.in_(["Confirmed", "Verified"]),
        Booking.start_at < end_at,
        Booking.end_at > start_at,
    ).with_for_update().first()
    if overlap:
        return jsonify({"error": "Slot already booked"}), 409

    booking = Booking(user_id=user_id, resource_id=resource_id,
                      start_at=start_at, end_at=end_at, status="Confirmed")
    db.session.add(booking)
    db.session.commit()
    return jsonify({"id": booking.id, "status": booking.status}), 201


@app.get("/api/bookings")
@login_required
def list_bookings():
    user = current_user()
    query = Booking.query
    if user.role == "Student":
        query = query.filter_by(user_id=user.id)
    rows = query.order_by(Booking.start_at).all()
    return jsonify([{"id": b.id, "resource": b.resource.name,
                     "start_at": b.start_at.isoformat(), "end_at": b.end_at.isoformat(),
                     "status": b.status} for b in rows])


@app.post("/api/maintenance/release")
@roles_required("Admin")
def release_unused_slots():
    cutoff = datetime.utcnow() - timedelta(minutes=15)
    count = Booking.query.filter(
        Booking.status == "Confirmed",
        Booking.start_at < cutoff,
        Booking.verified_at.is_(None),
    ).update({"status": "Cancelled"}, synchronize_session=False)
    db.session.commit()
    return jsonify({"released": count})


@app.post("/api/bookings/<int:booking_id>/verify")
@roles_required("Lab Assistant", "Admin")
def verify_booking(booking_id):
    booking = db.session.get(Booking, booking_id)
    if not booking:
        return jsonify({"error": "Booking not found"}), 404
    booking.status = "Verified"
    booking.verified_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"id": booking.id, "status": booking.status})


@app.get("/api/lost-items")
@login_required
def lost_items():
    rows = LostItem.query.order_by(LostItem.found_at.desc()).all()
    return jsonify([{"id": i.id, "title": i.title, "category": i.category,
                     "location": i.location, "status": i.status} for i in rows])


@app.post("/api/lost-items")
@roles_required("Student", "Lab Assistant", "Admin")
def create_lost_item():
    data = request.get_json(silent=True) or {}
    if not data.get("title") or not data.get("location"):
        return jsonify({"error": "Title and location are required"}), 400
    item = LostItem(reporter_id=current_user().id, title=data["title"].strip(),
                    category=data.get("category", "Other"), location=data["location"].strip())
    db.session.add(item)
    db.session.commit()
    return jsonify({"id": item.id, "status": item.status}), 201


@app.post("/api/lost-items/<int:item_id>/claims")
@roles_required("Student")
def create_claim(item_id):
    data = request.get_json(silent=True) or {}
    if not data.get("proof"):
        return jsonify({"error": "Proof description is required"}), 400
    item = db.session.get(LostItem, item_id)
    if not item:
        return jsonify({"error": "Item not found"}), 404
    claim = Claim(item_id=item_id, claimant_id=current_user().id, proof=data["proof"])
    item.status = "Claim_Pending"
    db.session.add(claim)
    db.session.commit()
    return jsonify({"id": claim.id, "status": claim.status}), 201


@app.get("/api/claims")
@login_required
def claims():
    user = current_user()
    query = Claim.query
    if user.role == "Student":
        query = query.filter_by(claimant_id=user.id)
    rows = query.order_by(Claim.id.desc()).all()
    return jsonify([{"id": c.id, "item": c.item.title, "proof": c.proof,
                     "claimant": c.claimant.name, "status": c.status} for c in rows])


@app.post("/api/claims/<int:claim_id>/resolve")
@roles_required("Admin")
def resolve_claim(claim_id):
    data = request.get_json(silent=True) or {}
    status = data.get("status")
    if status not in ("Approved", "Rejected"):
        return jsonify({"error": "Status must be Approved or Rejected"}), 400
    claim = db.session.get(Claim, claim_id)
    if not claim:
        return jsonify({"error": "Claim not found"}), 404
    claim.status = "Approved" if status == "Approved" else "Rejected"
    claim.item.status = "Resolved" if status == "Approved" else "Unclaimed"
    db.session.commit()
    return jsonify({"id": claim.id, "status": claim.status})


@app.get("/api/dashboard/stats")
@login_required
def dashboard_stats():
    user = current_user()
    booking_query = Booking.query
    claim_query = Claim.query
    if user.role == "Student":
        booking_query = booking_query.filter_by(user_id=user.id)
        claim_query = claim_query.filter_by(claimant_id=user.id)
    return jsonify({
        "total_resources": Resource.query.count(),
        "confirmed_bookings": booking_query.filter_by(status="Confirmed").count(),
        "cancelled_bookings": booking_query.filter_by(status="Cancelled").count(),
        "pending_claims": claim_query.filter_by(status="Claim_Pending").count(),
        "most_used_resource": db.session.query(Resource.name, func.count(Booking.id)).join(Booking).group_by(Resource.id).order_by(func.count(Booking.id).desc()).first()[0] if Booking.query.first() else "No bookings",
    })


@app.get("/")
def frontend():
    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "FRONTEND"))
    return send_from_directory(frontend_dir, "index.html")


@app.get("/<path:path>")
def frontend_assets(path):
    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "FRONTEND"))
    return send_from_directory(frontend_dir, path)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
