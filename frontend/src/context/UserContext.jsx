import { useState, useCallback } from 'react';
import { getCurrentUserId, removeToken } from '../auth';
import { UserContext } from './userContext';

export function UserProvider({ children }) {
  const [currentUserId, setCurrentUserId] = useState(() => getCurrentUserId());

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
