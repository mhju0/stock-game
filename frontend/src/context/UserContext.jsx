import { useState, useCallback, useEffect } from 'react';
import { getCurrentUserId, removeToken, subscribeToTokenChanges } from '../auth';
import { UserContext } from './userContext';

export function UserProvider({ children }) {
  const [currentUserId, setCurrentUserId] = useState(() => getCurrentUserId());

  useEffect(() => subscribeToTokenChanges(() => window.location.reload()), [])

  const logout = useCallback(() => {
    removeToken();
    setCurrentUserId(null);
    window.location.href = '/login';
  }, []);

  return (
    <UserContext.Provider value={{ currentUserId, setCurrentUserId, logout }}>
      {children}
    </UserContext.Provider>
  );
}
