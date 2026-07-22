import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import toast from "react-hot-toast";
import AppLayout from "../components/AppLayout";
import ConfirmModal from "../components/ConfirmModal";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, isAdminRole } from "../utils/auth";
import { listVariants, modalVariants, springTransition } from "../utils/motion";

import {
  getUsers as _getUsers,
  createUser as _createUser,
  updateUser as _updateUser,
  deleteUser as _deleteUser,
} from "../api/identityApi";

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLES = ["admin", "super_admin", "registrar", "accounting", "teacher", "guardian"];

const ROLE_META = {
  admin:       { bg: "#fde8e8", color: "#9b2020",  label: "Admin",       activeBg: "#fde8e8", activeBorder: "#fca5a5" },
  super_admin: { bg: "#f0e8fd", color: "#6d28d9",  label: "Super Admin", activeBg: "#f0e8fd", activeBorder: "#c4b5fd" },
  registrar:   { bg: "#e3f0fd", color: "#1455a0",  label: "Registrar",   activeBg: "#e3f0fd", activeBorder: "#93c5fd" },
  accounting:  { bg: "#e8f5e0", color: "#2e6b0d",  label: "Accounting",  activeBg: "#e8f5e0", activeBorder: "#86efac" },
  teacher:     { bg: "#fef3e2", color: "#7a4a08",  label: "Teacher",     activeBg: "#fef3e2", activeBorder: "#fcd34d" },
  guardian:    { bg: "#e8f4fd", color: "#0369a1",  label: "Guardian",    activeBg: "#e8f4fd", activeBorder: "#7dd3fc" },
};

const C = {
  red: "#e03131", redDark: "#c92a2a", redLight: "#fff0f0", redBorder: "#fca5a5",
  border: "#f5eaea", softBorder: "#f9f0f0", text: "#1a0a0a",
  muted: "#7a5050", pale: "#b09090", micro: "#c0a0a0", bg: "#fdf8f6", white: "#ffffff",
};

const baseCss = `
  @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
  @keyframes spin    { to{transform:rotate(360deg)} }
  .search-wrap:focus-within { border-color:#e03131 !important; box-shadow:0 0 0 3px rgba(224,49,49,0.09) !important; }
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

const PALETTE = [
  ["#fde8e8","#e03131"],["#e3f0fd","#1455a0"],["#e8f5e0","#2e6b0d"],
  ["#f0e8fd","#6d28d9"],["#fef3e2","#7a4a08"],["#e8f4fd","#0369a1"],
];

function avatarColors(name = "") {
  const i = name.charCodeAt(0) % PALETTE.length;
  return PALETTE[i];
}

function initials(name = "") {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (name.slice(0, 2).toUpperCase() || "??");
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function Sk({ w = "100%", h = 14, r = 6 }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: "linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)",
      backgroundSize: "200% 100%", animation: "shimmer 1.6s ease-in-out infinite",
    }} />
  );
}

// ── AnimatedCount ─────────────────────────────────────────────────────────────

function AnimatedCount({ value, style }) {
  const mv = useMotionValue(value);
  const spring = useSpring(mv, { stiffness: 90, damping: 18 });
  const display = useTransform(spring, v => Math.round(v));
  const [shown, setShown] = useState(value);

  useEffect(() => { mv.set(value); }, [value]);
  useEffect(() => display.on("change", v => setShown(v)), [display]);

  return <span style={style}>{shown}</span>;
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ user, size = 36, style = {} }) {
  const [bg, fg] = avatarColors(user.name);
  if (user.profile_picture) {
    return (
      <img
        src={user.profile_picture} alt={user.name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, ...style }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.35, fontWeight: 700, color: fg, flexShrink: 0, ...style,
    }}>
      {initials(user.name)}
    </div>
  );
}

function RoleBadge({ role }) {
  const meta = ROLE_META[role] || { bg: "#f0ede8", color: "#5c5752", label: role };
  return (
    <span style={{
      background: meta.bg, color: meta.color,
      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
    }}>{meta.label}</span>
  );
}

// ── Role Chip Picker (used inside modals) ─────────────────────────────────────

function RoleChipPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {ROLES.map(r => {
        const meta = ROLE_META[r];
        const active = value === r;
        return (
          <motion.button
            key={r}
            onClick={() => onChange(r)}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            style={{
              height: 32, padding: "0 14px", borderRadius: 99, border: "1.5px solid",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
              backgroundColor: active ? meta.activeBg     : C.white,
              color:           active ? meta.color        : "#9a7070",
              borderColor:     active ? meta.activeBorder : "#f0e4e4",
              transition: "background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease",
            }}
          >
            {meta.label}
          </motion.button>
        );
      })}
    </div>
  );
}

// ── Edit Profile Modal ────────────────────────────────────────────────────────

function EditProfileModal({ user, currentUser, onClose, onSaved }) {
  const isAdmin = isAdminRole(currentUser?.role);
  const isSelf = currentUser?.id === user.user_id;

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState(user.role);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPwSection, setShowPwSection] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [picPreview, setPicPreview] = useState(user.profile_picture || null);
  const [picData, setPicData] = useState(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef();

  function handlePicChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError("Image must be under 2 MB."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => { setPicPreview(ev.target.result); setPicData(ev.target.result); };
    reader.readAsDataURL(file);
  }

  function removePic() {
    setPicPreview(null); setPicData(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSave() {
    setError("");
    if (!name.trim()) { setError("Name cannot be empty."); return; }
    if (!email.trim()) { setError("Email cannot be empty."); return; }
    if (showPwSection) {
      if (newPw.length < 8) { setError("New password must be at least 8 characters."); return; }
      if (newPw !== confirmPw) { setError("Passwords do not match."); return; }
    }

    const body = { name: name.trim(), email: email.trim() };
    if (isAdmin) body.role = role;
    if (showPwSection && newPw) {
      body.new_password = newPw;
      if (isSelf) body.current_password = currentPw;
    }
    if (picData !== undefined) body.profile_picture = picData;

    setSaving(true);
    try {
      const data = await _updateUser(user.user_id, body);
      toast.success("Profile updated.");
      onSaved(data);
      onClose();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to save changes.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: "100%", height: 40, border: `1.5px solid ${C.border}`, borderRadius: 10,
    padding: "0 14px", fontSize: 13, color: C.text, outline: "none",
    boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", background: C.white,
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.42)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(4px)" }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          variants={modalVariants} initial="hidden" animate="visible" exit="exit"
          transition={springTransition}
          style={{ background: C.white, borderRadius: 20, width: "100%", maxWidth: 480, boxShadow: "0 24px 64px rgba(224,49,49,0.18)", overflow: "hidden" }}
        >
          {/* Header */}
          <div style={{ padding: "22px 26px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: C.redLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className="ti ti-user-edit" style={{ fontSize: 22, color: C.red }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Edit Profile</div>
              <div style={{ fontSize: 12, color: C.pale, marginTop: 2 }}>
                {isSelf ? "Editing your own profile" : `Editing ${user.name}'s profile`}
              </div>
            </div>
            <motion.button
              onClick={onClose} aria-label="Close" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              style={{ width: 32, height: 32, border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, cursor: "pointer", color: C.pale, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <i className="ti ti-x" style={{ fontSize: 14 }} />
            </motion.button>
          </div>

          {/* Body */}
          <div style={{ padding: "22px 26px", display: "flex", flexDirection: "column", gap: 18, maxHeight: "66vh", overflowY: "auto" }}>

            {/* Profile picture */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ position: "relative" }}>
                {picPreview
                  ? <img src={picPreview} alt="Preview" style={{ width: 68, height: 68, borderRadius: "50%", objectFit: "cover", border: `2px solid ${C.border}` }} />
                  : <div style={{ width: 68, height: 68, borderRadius: "50%", background: avatarColors(name)[0], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: avatarColors(name)[1], border: `2px solid ${C.border}` }}>{initials(name)}</div>
                }
                <motion.button
                  onClick={() => fileRef.current?.click()}
                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                  style={{ position: "absolute", bottom: 0, right: 0, width: 24, height: 24, borderRadius: "50%", background: C.red, border: "2px solid white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <i className="ti ti-camera" style={{ fontSize: 11, color: "white" }} />
                </motion.button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <motion.button
                  onClick={() => fileRef.current?.click()}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  style={{ fontSize: 12, fontWeight: 600, color: C.red, background: C.redLight, border: `1px solid ${C.redBorder}`, borderRadius: 8, padding: "5px 14px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                >
                  Upload photo
                </motion.button>
                {picPreview && (
                  <button onClick={removePic} style={{ fontSize: 12, color: C.pale, background: "transparent", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "'DM Sans', sans-serif" }}>
                    Remove photo
                  </button>
                )}
                <div style={{ fontSize: 11, color: C.pale }}>JPG, PNG or GIF · max 2 MB</div>
              </div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" style={{ display: "none" }} onChange={handlePicChange} />
            </div>

            {/* Name */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: "block", marginBottom: 6 }}>Full Name</label>
              <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
            </div>

            {/* Email */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: "block", marginBottom: 6 }}>Email Address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
            </div>

            {/* Role (admin only) */}
            {isAdmin && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: "block", marginBottom: 8 }}>Role</label>
                <RoleChipPicker value={role} onChange={setRole} />
              </div>
            )}

            {/* Password toggle */}
            <div>
              <motion.button
                onClick={() => setShowPwSection(v => !v)}
                whileHover={{ x: 2 }}
                style={{ fontSize: 12, fontWeight: 600, color: C.red, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6, fontFamily: "'DM Sans', sans-serif" }}
              >
                <i className={`ti ${showPwSection ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize: 13 }} />
                {showPwSection ? "Cancel password change" : "Change password"}
              </motion.button>
            </div>

            <AnimatePresence>
              {showPwSection && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  style={{ overflow: "hidden" }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "14px 16px", background: "#fff8f6", borderRadius: 12, border: `1px solid ${C.border}` }}>
                    {isSelf && (
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: "block", marginBottom: 6 }}>Current Password</label>
                        <div style={{ position: "relative" }}>
                          <input type={showCurrentPw ? "text" : "password"} value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Enter current password"
                            style={{ ...inputStyle, padding: "0 40px 0 14px" }} />
                          <button onClick={() => setShowCurrentPw(v => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.pale, fontSize: 15 }}>
                            <i className={`ti ${showCurrentPw ? "ti-eye-off" : "ti-eye"}`} />
                          </button>
                        </div>
                      </div>
                    )}
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: "block", marginBottom: 6 }}>New Password</label>
                      <div style={{ position: "relative" }}>
                        <input type={showNewPw ? "text" : "password"} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="At least 8 characters"
                          style={{ ...inputStyle, padding: "0 40px 0 14px" }} />
                        <button onClick={() => setShowNewPw(v => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.pale, fontSize: 15 }}>
                          <i className={`ti ${showNewPw ? "ti-eye-off" : "ti-eye"}`} />
                        </button>
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: "block", marginBottom: 6 }}>Confirm New Password</label>
                      <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat new password" style={inputStyle} />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                  style={{ background: "#fde8e8", border: "1px solid #fca5a5", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#9b2020", display: "flex", alignItems: "center", gap: 8 }}
                >
                  <i className="ti ti-alert-circle" />{error}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div style={{ padding: "16px 26px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <motion.button onClick={onClose} whileHover={{ borderColor: C.red, color: C.red }} whileTap={{ scale: 0.97 }}
              style={{ height: 38, padding: "0 20px", border: `1px solid ${C.border}`, borderRadius: 10, background: C.white, fontSize: 13, fontWeight: 600, color: C.muted, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              Cancel
            </motion.button>
            <motion.button onClick={handleSave} disabled={saving} whileHover={!saving ? { scale: 1.02, boxShadow: "0 6px 20px rgba(224,49,49,0.35)" } : {}} whileTap={!saving ? { scale: 0.97 } : {}}
              style={{ height: 38, padding: "0 22px", border: "none", borderRadius: 10, background: `linear-gradient(135deg,${C.red},${C.redDark})`, color: "white", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, fontFamily: "'DM Sans', sans-serif", boxShadow: "0 4px 14px rgba(224,49,49,0.26)" }}>
              {saving ? "Saving…" : "Save Changes"}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Create User Modal ─────────────────────────────────────────────────────────

function CreateUserModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("registrar");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    setError("");
    if (!name.trim() || !email.trim() || !password) { setError("All fields are required."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }

    setSaving(true);
    try {
      const data = await _createUser({ name: name.trim(), email: email.trim(), role, password });
      toast.success("User account created.");
      onCreated(data);
      onClose();
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || "Network error. Please try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: "100%", height: 40, border: `1.5px solid ${C.border}`, borderRadius: 10,
    padding: "0 14px", fontSize: 13, color: C.text, outline: "none",
    boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", background: C.white,
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.42)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(4px)" }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          variants={modalVariants} initial="hidden" animate="visible" exit="exit"
          transition={springTransition}
          style={{ background: C.white, borderRadius: 20, width: "100%", maxWidth: 440, boxShadow: "0 24px 64px rgba(224,49,49,0.18)", overflow: "hidden" }}
        >
          {/* Header */}
          <div style={{ padding: "22px 26px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: C.redLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className="ti ti-user-plus" style={{ fontSize: 22, color: C.red }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Create User Account</div>
              <div style={{ fontSize: 12, color: C.pale, marginTop: 2 }}>Add a new admin portal user</div>
            </div>
            <motion.button onClick={onClose} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              style={{ width: 32, height: 32, border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, cursor: "pointer", color: C.pale, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="ti ti-x" style={{ fontSize: 14 }} />
            </motion.button>
          </div>

          <div style={{ padding: "22px 26px", display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              { label: "Full Name", val: name, set: setName, placeholder: "e.g. Maria Santos", type: "text" },
              { label: "Email Address", val: email, set: setEmail, placeholder: "e.g. maria@school.edu", type: "email" },
            ].map(({ label, val, set, placeholder, type }) => (
              <div key={label}>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: "block", marginBottom: 6 }}>{label}</label>
                <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={placeholder} style={inputStyle} />
              </div>
            ))}

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: "block", marginBottom: 8 }}>Role</label>
              <RoleChipPicker value={role} onChange={setRole} />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: "block", marginBottom: 6 }}>Password</label>
              <div style={{ position: "relative" }}>
                <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters"
                  style={{ ...inputStyle, padding: "0 40px 0 14px" }} />
                <button onClick={() => setShowPw(v => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.pale, fontSize: 15 }}>
                  <i className={`ti ${showPw ? "ti-eye-off" : "ti-eye"}`} />
                </button>
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                  style={{ background: "#fde8e8", border: "1px solid #fca5a5", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#9b2020", display: "flex", alignItems: "center", gap: 8 }}
                >
                  <i className="ti ti-alert-circle" />{error}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div style={{ padding: "16px 26px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <motion.button onClick={onClose} whileHover={{ borderColor: C.red, color: C.red }} whileTap={{ scale: 0.97 }}
              style={{ height: 38, padding: "0 20px", border: `1px solid ${C.border}`, borderRadius: 10, background: C.white, fontSize: 13, fontWeight: 600, color: C.muted, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              Cancel
            </motion.button>
            <motion.button onClick={handleCreate} disabled={saving} whileHover={!saving ? { scale: 1.02, boxShadow: "0 6px 20px rgba(224,49,49,0.35)" } : {}} whileTap={!saving ? { scale: 0.97 } : {}}
              style={{ height: 38, padding: "0 22px", border: "none", borderRadius: 10, background: `linear-gradient(135deg,${C.red},${C.redDark})`, color: "white", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, fontFamily: "'DM Sans', sans-serif", boxShadow: "0 4px 14px rgba(224,49,49,0.26)" }}>
              {saving ? "Creating…" : "Create User"}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────

function DeleteModal({ user, currentUser, onClose, onDeleted }) {
  const isSelf = currentUser?.id === user.user_id;
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(() =>
    isSelf ? "You cannot delete your own account." : ""
  );

  async function handleDelete() {
    if (isSelf) return;
    setDeleting(true);
    try {
      await _deleteUser(user.user_id);
      toast.success("User account deleted.");
      onDeleted(user.user_id);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.detail || "Network error. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ConfirmModal
      icon="ti-trash"
      title="Delete user account?"
      message={<>Are you sure you want to delete <strong>{user.name}</strong>? This action cannot be undone.</>}
      error={error}
      loading={deleting}
      confirmDisabled={isSelf}
      confirmLabel="Delete"
      onConfirm={handleDelete}
      onCancel={onClose}
    />
  );
}

// ── User Row ──────────────────────────────────────────────────────────────────

function UserRow({ user, currentUser, isAdmin, onSaved, onDeleted }) {
  const isSelf = currentUser?.id === user.user_id;
  const canEdit = isAdmin || isSelf;
  const canDelete = isAdmin && !isSelf;
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <>
      <motion.tr
        variants={listVariants.item}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        animate={{ backgroundColor: hovered ? "#fff8f6" : C.white }}
        transition={{ duration: 0.12 }}
        style={{ borderBottom: `1px solid ${C.softBorder}` }}
      >
        {/* User */}
        <td style={{ padding: "12px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar user={user} size={36} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</span>
                {isSelf && (
                  <motion.span
                    initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    style={{ fontSize: 10, fontWeight: 700, background: "#e8f5e0", color: "#2e6b0d", padding: "2px 8px", borderRadius: 99, flexShrink: 0 }}
                  >
                    You
                  </motion.span>
                )}
              </div>
              <div style={{ fontSize: 12, color: C.pale, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
            </div>
          </div>
        </td>

        {/* Role */}
        <td style={{ padding: "12px 18px" }}>
          <RoleBadge role={user.role} />
        </td>

        {/* User ID */}
        <td style={{ padding: "12px 18px" }}>
          <span style={{ fontSize: 12, color: C.pale, fontFamily: "monospace" }}>#{user.user_id}</span>
        </td>

        {/* Actions */}
        <td style={{ padding: "12px 18px" }}>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            {canEdit && (
              <motion.button
                onClick={() => setEditOpen(true)}
                aria-label={`Edit ${user.name}`}
                whileTap={{ scale: 0.95 }}
                style={{ height: 32, width: 32, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: C.white, color: C.muted, transition: "background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease" }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = C.redLight; e.currentTarget.style.color = C.red; e.currentTarget.style.borderColor = C.redBorder; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = C.white; e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border; }}
              >
                <i className="ti ti-pencil" />
              </motion.button>
            )}
            {canDelete && (
              <motion.button
                onClick={() => setDeleteOpen(true)}
                aria-label={`Delete ${user.name}`}
                whileTap={{ scale: 0.95 }}
                style={{ height: 32, width: 32, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: C.white, color: C.pale, transition: "background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease" }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#fde8e8"; e.currentTarget.style.color = C.red; e.currentTarget.style.borderColor = C.redBorder; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = C.white; e.currentTarget.style.color = C.pale; e.currentTarget.style.borderColor = C.border; }}
              >
                <i className="ti ti-trash" />
              </motion.button>
            )}
          </div>
        </td>
      </motion.tr>

      {editOpen && (
        <EditProfileModal
          user={user} currentUser={currentUser}
          onClose={() => setEditOpen(false)}
          onSaved={(u) => { onSaved(u); setEditOpen(false); }}
        />
      )}
      <AnimatePresence>
        {deleteOpen && (
          <DeleteModal
            user={user}
            currentUser={currentUser}
            onClose={() => setDeleteOpen(false)}
            onDeleted={(id) => { onDeleted(id); setDeleteOpen(false); }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const STAT_DEFS = [
  { key: "total",      label: "Total Users",  icon: "ti-users",        color: C.red,      bg: C.redLight, clickable: true },
  { key: "admins",     label: "Admins",        icon: "ti-shield-check", color: "#6d28d9",  bg: "#f0e8fd" },
  { key: "staff",      label: "Staff",         icon: "ti-user",         color: "#1455a0",  bg: "#e3f0fd" },
  { key: "active",     label: "Online Now",    icon: "ti-circle-check", color: "#2e6b0d",  bg: "#e8f5e0" },
];

export default function UsersPage() {
  usePageTitle("Users");
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const isAdmin = isAdminRole(currentUser?.role);

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!currentUser) { navigate("/login"); return; }
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true); setError("");
    try {
      const data = await _getUsers();
      setUsers(data);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401)      setError("Session expired. Please log in again.");
      else if (status === 403) setError("You don't have permission to view users.");
      else                     setError("Failed to load users. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleCreated(newUser) {
    setUsers(prev => [...prev, newUser]);
  }

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !search || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const isFirstRender = useIsFirstRender();

  const stats = {
    total:  users.length,
    admins: users.filter(u => isAdminRole(u.role)).length,
    staff:  users.filter(u => !isAdminRole(u.role)).length,
    active: 1, // current session user is "online"
  };

  const hasActiveFilters = roleFilter !== "all" || search;

  return (
    <AppLayout>
      <style>{baseCss}</style>

      {/* Topbar */}
      <motion.div
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: "0 28px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, boxShadow: "0 1px 8px rgba(224,49,49,0.04)" }}
      >
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 700, color: C.text, letterSpacing: "-0.01em", margin: 0 }}>Users</h1>
          <div style={{ fontSize: 11.5, color: C.pale, marginTop: 1 }}>
            {loading ? "Loading…" : <><AnimatedCount value={users.length} /> user{users.length !== 1 ? "s" : ""} registered</>}
          </div>
        </div>
        {isAdmin && (
          <motion.button
            onClick={() => setShowCreate(true)}
            whileHover={{ scale: 1.02, boxShadow: "0 6px 20px rgba(224,49,49,0.35)" }}
            whileTap={{ scale: 0.96 }}
            style={{ display: "flex", alignItems: "center", gap: 8, background: `linear-gradient(135deg,${C.red},${C.redDark})`, color: "white", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}
          >
            <i className="ti ti-user-plus" style={{ fontSize: 15 }} /> New User
          </motion.button>
        )}
      </motion.div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Stat cards */}
        <motion.div
          initial={isFirstRender ? { y: 10, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.28, delay: 0.08, ease: "easeOut" }}
          style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}
        >
          {STAT_DEFS.map(s => {
            const isActive = s.clickable && roleFilter === "all";
            return (
              <motion.div
                key={s.key}
                onClick={s.clickable ? () => setRoleFilter("all") : undefined}
                whileHover={s.clickable ? { boxShadow: isActive ? `0 8px 24px ${s.color}28` : "0 8px 24px rgba(0,0,0,0.08)" } : {}}
                whileTap={s.clickable ? { scale: 0.98 } : {}}
                transition={{ duration: 0.16 }}
                style={{
                  background: isActive ? s.bg : C.white, borderRadius: 14,
                  border: `1.5px solid ${isActive ? s.color : C.border}`,
                  padding: "16px 20px", display: "flex", alignItems: "center", gap: 14,
                  cursor: s.clickable ? "pointer" : "default",
                  boxShadow: "0 2px 12px rgba(224,49,49,0.06)",
                  transition: "border-color 0.15s ease, background-color 0.15s ease",
                }}
              >
                <div style={{
                  width: 42, height: 42, borderRadius: 12, background: isActive ? "white" : s.bg,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  transition: "background 0.15s",
                }}>
                  <i className={`ti ${s.icon}`} style={{ fontSize: 20, color: s.color }} />
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: isActive ? s.color : C.text, lineHeight: 1 }}>
                    {loading ? <Sk w={36} h={22} r={6} /> : <AnimatedCount value={stats[s.key]} />}
                  </div>
                  <div style={{ fontSize: 11, color: isActive ? s.color : C.pale, marginTop: 4, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Filter panel */}
        <motion.div
          initial={isFirstRender ? { y: 10, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.28, delay: 0.14, ease: "easeOut" }}
          style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: "18px 20px", boxShadow: "0 2px 12px rgba(224,49,49,0.05)", display: "flex", flexDirection: "column", gap: 14 }}
        >
          {/* Search row */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="search-wrap" style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, background: C.white, border: `1.5px solid #f0e4e4`, borderRadius: 12, padding: "0 16px", height: 42, transition: "border .15s, box-shadow .15s" }}>
              <i className="ti ti-search" style={{ color: C.pale, fontSize: 16, flexShrink: 0 }} />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                style={{ flex: 1, border: "none", outline: "none", fontSize: 13, color: C.text, background: "transparent", fontFamily: "'DM Sans', sans-serif" }}
              />
              <AnimatePresence>
                {search && (
                  <motion.button
                    initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }}
                    onClick={() => setSearch("")}
                    style={{ border: "none", background: "none", cursor: "pointer", color: C.pale, fontSize: 16, display: "flex", padding: 0 }}
                  >
                    <i className="ti ti-x" style={{ fontSize: 14 }} />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {hasActiveFilters && (
                <motion.button
                  initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.85, opacity: 0 }}
                  onClick={() => { setRoleFilter("all"); setSearch(""); }}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                  style={{ height: 36, padding: "0 14px", borderRadius: 99, border: `1.5px solid ${C.redBorder}`, background: C.redLight, color: C.red, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}
                >
                  <i className="ti ti-x" style={{ fontSize: 12 }} /> Clear
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Role chips */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.micro, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Role</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {/* All chip */}
              <motion.button
                onClick={() => setRoleFilter("all")}
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                style={{ height: 32, padding: "0 14px", borderRadius: 99, border: "1.5px solid", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", backgroundColor: roleFilter === "all" ? C.redLight : C.white, color: roleFilter === "all" ? C.red : "#9a7070", borderColor: roleFilter === "all" ? C.redBorder : "#f0e4e4", transition: "background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease" }}
              >
                All
              </motion.button>
              {ROLES.map((r, idx) => {
                const meta = ROLE_META[r];
                const active = roleFilter === r;
                return (
                  <motion.button
                    key={r}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut", delay: idx * 0.03 }}
                    whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={() => setRoleFilter(r)}
                    style={{ height: 32, padding: "0 14px", borderRadius: 99, border: "1.5px solid", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", backgroundColor: active ? meta.activeBg : C.white, color: active ? meta.color : "#9a7070", borderColor: active ? meta.activeBorder : "#f0e4e4", transition: "background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease" }}
                  >
                    {meta.label}
                  </motion.button>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* Table */}
        <AnimatePresence mode="wait">
          {error ? (
            <motion.div key="error" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ background: "#fde8e8", border: "1px solid #fca5a5", borderRadius: 14, padding: "24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
              <i className="ti ti-alert-circle" style={{ fontSize: 28, color: C.red }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: "#9b2020" }}>{error}</div>
              <motion.button onClick={fetchUsers} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                style={{ fontSize: 13, color: C.red, background: C.redLight, border: `1px solid ${C.redBorder}`, borderRadius: 8, padding: "6px 16px", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
                Try again
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              key="table"
              initial={isFirstRender ? { opacity: 0, y: 10 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: 0.2, ease: "easeOut" }}
              style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.border}`, overflow: "hidden", boxShadow: "0 2px 16px rgba(224,49,49,0.06)" }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {["User", "Role", "ID", ""].map(h => (
                      <th key={h} style={{ textAlign: h === "" ? "right" : "left", fontSize: 10.5, fontWeight: 600, color: C.micro, padding: "12px 18px", textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <motion.tbody
                  variants={listVariants.container}
                  initial={isFirstRender ? "hidden" : false}
                  animate="visible"
                >
                  {loading
                    ? [1, 2, 3, 4].map(i => (
                        <tr key={i} style={{ borderBottom: `1px solid ${C.softBorder}` }}>
                          <td style={{ padding: "12px 18px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <Sk w={36} h={36} r={99} />
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <Sk w={130} h={13} />
                                <Sk w={180} h={11} />
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: "12px 18px" }}><Sk w={72} h={22} r={99} /></td>
                          <td style={{ padding: "12px 18px" }}><Sk w={40} h={13} /></td>
                          <td style={{ padding: "12px 18px" }}><div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Sk w={32} h={32} r={8} /><Sk w={32} h={32} r={8} /></div></td>
                        </tr>
                      ))
                    : filtered.length === 0
                    ? (
                        <tr>
                          <td colSpan={4}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "56px 24px", textAlign: "center" }}>
                              <div style={{ width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg,#fff0f0,#fde8e8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <i className="ti ti-users" style={{ fontSize: 24, color: "#e08080" }} />
                              </div>
                              <div style={{ fontSize: 14, fontWeight: 600, color: "#7a5050" }}>
                                {hasActiveFilters ? "No users match your filters" : "No users found"}
                              </div>
                              <div style={{ fontSize: 13, color: C.pale }}>
                                {hasActiveFilters ? "Try adjusting the role or search term." : "Create your first user to get started."}
                              </div>
                              {hasActiveFilters && (
                                <motion.button onClick={() => { setRoleFilter("all"); setSearch(""); }}
                                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                                  style={{ fontSize: 12, color: C.red, background: C.redLight, border: `1px solid ${C.redBorder}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
                                  Clear filters
                                </motion.button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    : filtered.map(u => (
                        <UserRow
                          key={u.user_id}
                          user={u}
                          currentUser={currentUser}
                          isAdmin={isAdmin}
                          onSaved={updated => setUsers(prev => prev.map(x => x.user_id === updated.user_id ? updated : x))}
                          onDeleted={id => setUsers(prev => prev.filter(x => x.user_id !== id))}
                        />
                      ))
                  }
                </motion.tbody>
              </table>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* Modals */}
      {showCreate && (
        <CreateUserModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </AppLayout>
  );
}
