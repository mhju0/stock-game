import { createContext, useState, useEffect } from 'react';

// This creates the global "store" for our user data
export const UserContext = createContext();

export function UserProvider({ children }) {
  // We check localStorage so the user stays logged in even if they refresh the page
  const [currentUserId, setCurrentUserId] = useState(() => {
    const saved = localStorage.getItem('stockGameUserId');
    return saved ? parseInt(saved) : null;
  });

  // Whenever the current user changes, save their ID to the browser
  useEffect(() => {
    if (currentUserId) {
      localStorage.setItem('stockGameUserId', currentUserId);
    } else {
      localStorage.removeItem('stockGameUserId');
    }
  }, [currentUserId]);

  return (
    <UserContext.Provider value={{ currentUserId, setCurrentUserId }}>
      {children}
    </UserContext.Provider>
  );
}