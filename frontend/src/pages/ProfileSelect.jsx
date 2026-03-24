import { apiFetch, apiPost, apiDelete } from '../api'
import { useState, useEffect, useContext } from 'react';
import { UserContext } from '../context/UserContext';
import { useTranslation } from 'react-i18next';


function ProfileSelect() {
  const { t } = useTranslation();
  const { setCurrentUserId } = useContext(UserContext);
  
  const [users, setUsers] = useState([]);
  const [newUsername, setNewUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    const data = await apiFetch('/users', {}, (err) => {
      setError(err);
      setLoading(false);
    });
    if (data) {
      setUsers(data);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleSelectUser = (userId) => {
    setCurrentUserId(userId);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUsername.trim()) return;
    
    setError('');
    const data = await apiPost('/users/new', { username: newUsername.trim() }, setError);
    
    if (data && !data.error) {
      setCurrentUserId(data.id);
    } else if (data?.error) {
      setError(data.error);
    }
  };

  const handleDeleteUser = async (e, userId, username) => {
    e.stopPropagation(); 
    
    if (!window.confirm(`Are you sure you want to delete '${username}'?\nThis will permanently erase all game data, transactions, and history.`)) {
      return;
    }

    const data = await apiDelete(`/users/${userId}`, setError);
    if (data) {
      setUsers(users.filter(u => u.id !== userId));
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: '0 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>{t('common.appName') || 'Stock Game'}</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Select a profile to start trading</p>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="card-title">Existing Profiles</h2>
        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>{t('common.loading')}</p>
        ) : users.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No profiles found. Create one below!</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {users.map(user => (
              <div key={user.id} style={{ display: 'flex', gap: 8 }}>
                <button 
                  className="btn" 
                  onClick={() => handleSelectUser(user.id)}
                  style={{ 
                    flex: 1, // Let this button take up the remaining space
                    justifyContent: 'space-between', 
                    padding: '12px 16px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-secondary)'
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{user.username}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    ₩{Math.round(user.balance_krw).toLocaleString()}
                  </span>
                </button>
                
                {/* NEW: Delete Button */}
                <button
                  className="btn"
                  onClick={(e) => handleDeleteUser(e, user.id, user.username)}
                  style={{
                    padding: '0 16px',
                    border: '1px solid #fde8e8',
                    background: 'transparent',
                    color: '#ff3b30'
                  }}
                  title="Delete Profile"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="card-title">Create New Profile</h2>
        <form onSubmit={handleCreateUser} style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
          <input 
            className="input" 
            placeholder="Enter a username..." 
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            maxLength={15}
          />
          {error && <p style={{ color: '#ff3b30', fontSize: 13 }}>{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={!newUsername.trim()}>
            Create & Play
          </button>
        </form>
      </div>
    </div>
  );
}

export default ProfileSelect;